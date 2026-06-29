import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Phone, 
  MessageSquare, 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  Loader2,
  ListTodo,
  History,
  CheckSquare,
  Square,
  Trash2,
  Mail,
  FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

export function LeadDrawer({
  lead,
  open,
  onClose,
  onUpdate,
  readOnly = false
}: {
  lead: any;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  
  // Carrega dados do perfil do usuário logado para identificar se é lojista ou admin
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile_drawer", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const [activeTab, setActiveTab] = useState<"history" | "tasks" | "appointments">("history");
  
  // States: Activities
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // States: SDRs
  const [sdrs, setSdrs] = useState<any[]>([]);
  const [assignedTo, setAssignedTo] = useState<string | null>(lead?.assigned_to || null);
  const [updatingAssignment, setUpdatingAssignment] = useState(false);

  // States: Tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskType, setNewTaskType] = useState("WhatsApp");
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState<string>("");

  // States: Appointments (Visitas Agendadas)
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [newApptDate, setNewApptDate] = useState("");
  const [newApptTime, setNewApptTime] = useState("");
  const [newApptNotes, setNewApptNotes] = useState("");
  const [schedulingAppt, setSchedulingAppt] = useState(false);

  useEffect(() => {
    if (open && lead) {
      loadActivities();
      loadSdrs();
      loadTasks();
      loadAppointments();
      setAssignedTo(lead.assigned_to || null);
      setActiveTab("history");
      
      // Reset task form
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setNewTaskDueTime("");
      setNewTaskType("WhatsApp");
      setNewTaskAssignedTo(lead.assigned_to || user?.id || "");

      // Reset appointment form
      setNewApptDate("");
      setNewApptTime("");
      setNewApptNotes("");
    }
  }, [open, lead]);

  const loadSdrs = async () => {
    if (readOnly) return;
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, role, client_id")
      .in("role", ["agency_sdr", "admin", "client_store"])
      .order("full_name");
    
    if (data) {
      const filtered = data.filter((p: any) => 
        p.role !== "client_store" || 
        !lead?.client_id || 
        p.client_id === lead.client_id
      );
      setSdrs(filtered);
    }
  };

  const handleAssign = async (newSdrId: string | null) => {
    if (readOnly) return;
    setUpdatingAssignment(true);
    const { error } = await (supabase as any)
      .from("crm_leads")
      .update({ assigned_to: newSdrId, updated_at: new Date().toISOString() })
      .eq("id", lead.id);

    if (error) {
      toast.error("Erro ao atribuir lead.");
    } else {
      toast.success("Responsável atualizado com sucesso.");
      setAssignedTo(newSdrId);
      
      // Auto-registrar atividade
      const sdrName = newSdrId ? sdrs.find(s => s.id === newSdrId)?.full_name : "Ninguém";
      await (supabase as any).from("crm_activities").insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: "Atribuição",
        description: `Lead atribuído a: ${sdrName}`
      });
      loadActivities();
      onUpdate();
    }
    setUpdatingAssignment(false);
  };

  const loadActivities = async () => {
    setLoadingActivities(true);
    const { data, error } = await (supabase as any)
      .from("crm_activities")
      .select("*, profiles:user_id(full_name)")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar histórico");
    } else {
      setActivities(data || []);
    }
    setLoadingActivities(false);
  };

  const handleAddActivity = async (type: string, description: string) => {
    if (readOnly) {
      const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
      const isUserAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
      const isClientStore = profile?.role === "client_store";
      if (!isClientStore && !isUserAdmin && profile?.role !== "admin") return;
    }
    if (!description.trim()) return;
    setAddingNote(true);
    
    const { error } = await (supabase as any).from("crm_activities").insert({
      lead_id: lead.id,
      user_id: user?.id,
      type,
      description
    });

    if (error) {
      toast.error("Erro ao registrar atividade");
    } else {
      toast.success("Atividade registrada");
      setNewNote("");
      loadActivities();
      onUpdate(); // Atualiza o kanban (cadência)
    }
    setAddingNote(false);
  };

  // --- Task Methods ---
  const loadTasks = async () => {
    setLoadingTasks(true);
    const { data, error } = await (supabase as any)
      .from("crm_tasks")
      .select("*, profiles:assigned_to(full_name)")
      .eq("lead_id", lead.id)
      .order("due_date", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar tarefas");
    } else {
      setTasks(data || []);
    }
    setLoadingTasks(false);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!newTaskTitle.trim() || !newTaskDueDate) {
      toast.error("Por favor, preencha o título e a data de vencimento.");
      return;
    }

    setAddingTask(true);
    try {
      const dateTimeStr = newTaskDueTime ? `${newTaskDueDate}T${newTaskDueTime}` : `${newTaskDueDate}T12:00`;
      const finalDueDate = new Date(dateTimeStr).toISOString();

      const { error } = await (supabase as any)
        .from("crm_tasks")
        .insert({
          lead_id: lead.id,
          assigned_to: newTaskAssignedTo || lead.assigned_to || user?.id || null,
          title: newTaskTitle.trim(),
          due_date: finalDueDate,
          type: newTaskType,
          status: "Pendente"
        });

      if (error) throw error;

      toast.success("Tarefa agendada com sucesso!");
      
      // Registrar log de atividade
      await (supabase as any).from("crm_activities").insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: "TarefaAgendada",
        description: `Agendada tarefa: "${newTaskTitle.trim()}" (${newTaskType}) para ${new Date(finalDueDate).toLocaleString("pt-BR")}`
      });

      // Reset
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setNewTaskDueTime("");
      setNewTaskAssignedTo(lead.assigned_to || user?.id || "");
      
      loadTasks();
      loadActivities();
      onUpdate();
    } catch (err) {
      toast.error("Erro ao salvar tarefa.");
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string, title: string) => {
    if (readOnly) return;
    const newStatus = currentStatus === "Pendente" ? "Concluida" : "Pendente";
    const actDescription = newStatus === "Concluida" 
      ? `Tarefa concluída: "${title}"` 
      : `Tarefa reaberta: "${title}"`;

    try {
      const { error } = await (supabase as any)
        .from("crm_tasks")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId);

      if (error) throw error;

      toast.success(newStatus === "Concluida" ? "Tarefa marcada como concluída." : "Tarefa reaberta.");

      // Registrar atividade
      await (supabase as any).from("crm_activities").insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: newStatus === "Concluida" ? "TarefaConcluida" : "TarefaReaberta",
        description: actDescription
      });

      loadTasks();
      loadActivities();
      onUpdate();
    } catch (err) {
      toast.error("Erro ao atualizar status da tarefa.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (readOnly) return;
    if (!window.confirm("Deseja realmente excluir esta tarefa?")) return;

    try {
      const { error } = await (supabase as any)
        .from("crm_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Tarefa excluída.");
      loadTasks();
      onUpdate();
    } catch (err) {
      toast.error("Erro ao excluir tarefa.");
    }
  };

  // --- Appointment Methods ---
  const loadAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const { data, error } = await (supabase as any)
        .from("crm_appointments")
        .select("*")
        .eq("lead_id", lead.id)
        .order("appointment_date", { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      toast.error("Erro ao carregar agendamentos de visitas.");
    } finally {
      setLoadingAppointments(false);
    }
  };

  const handleScheduleAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!newApptDate || !newApptTime) {
      toast.error("Por favor, selecione a data e o horário do agendamento.");
      return;
    }

    setSchedulingAppt(true);
    try {
      const dateTimeStr = `${newApptDate}T${newApptTime}`;
      const apptDate = new Date(dateTimeStr).toISOString();

      // 1. Criar o agendamento
      const { error: apptError } = await (supabase as any)
        .from("crm_appointments")
        .insert({
          lead_id: lead.id,
          user_id: user?.id,
          appointment_date: apptDate,
          notes: newApptNotes.trim() || null,
          status: "Agendado"
        });

      if (apptError) throw apptError;

      // 2. Mudar o status do lead para "Visita Agendada"
      const { error: leadUpdateError } = await (supabase as any)
        .from("crm_leads")
        .update({ 
          status: "Visita Agendada",
          updated_at: new Date().toISOString()
        })
        .eq("id", lead.id);

      // 3. Registrar log de atividade na timeline do lead
      const formattedDate = new Date(apptDate).toLocaleString("pt-BR");
      await (supabase as any).from("crm_activities").insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: "AgendamentoRealizado",
        description: `Visita na concessionária agendada para: ${formattedDate}.${newApptNotes.trim() ? ` Observações: ${newApptNotes.trim()}` : ""}`
      });

      toast.success("Visita na concessionária agendada com sucesso!");
      
      // Reset form
      setNewApptDate("");
      setNewApptTime("");
      setNewApptNotes("");

      loadAppointments();
      loadActivities();
      onUpdate(); // Atualiza painéis e funil
    } catch (err) {
      toast.error("Erro ao agendar visita.");
    } finally {
      setSchedulingAppt(false);
    }
  };

  const handleUpdateAppointmentStatus = async (apptId: string, newStatus: string) => {
    if (readOnly) return;
    try {
      const { error } = await (supabase as any)
        .from("crm_appointments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", apptId);

      if (error) throw error;

      toast.success(`Visita atualizada para: ${newStatus}`);

      // Registrar atividade na timeline
      await (supabase as any).from("crm_activities").insert({
        lead_id: lead.id,
        user_id: user?.id,
        type: "AgendamentoStatusAlterado",
        description: `Status da visita na concessionária alterado para: "${newStatus}"`
      });

      loadAppointments();
      loadActivities();
      onUpdate();
    } catch (err) {
      toast.error("Erro ao atualizar status da visita.");
    }
  };

  const handleWhatsAppContact = async () => {
    if (!lead?.phone) {
      toast.error("Este lead não possui número de telefone cadastrado.");
      return;
    }
    const cleanPhone = lead.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("Telefone inválido.");
      return;
    }
    const formattedPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    
    // Registrar atividade no histórico
    const { error } = await (supabase as any).from("crm_activities").insert({
      lead_id: lead.id,
      user_id: user?.id,
      type: "WhatsApp",
      description: "Contato via WhatsApp iniciado pelo SDR."
    });
    
    if (!error) {
      loadActivities();
      onUpdate();
    }
    
    // Abrir o WhatsApp Web
    window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}`, "_blank");
  };

  const handleCallContact = async () => {
    if (!lead?.phone) {
      toast.error("Este lead não possui número de telefone cadastrado.");
      return;
    }
    const cleanPhone = lead.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("Telefone inválido.");
      return;
    }
    
    // Registrar atividade no histórico
    const { error } = await (supabase as any).from("crm_activities").insert({
      lead_id: lead.id,
      user_id: user?.id,
      type: "Ligação",
      description: "Ligação efetuada para o cliente pelo SDR."
    });
    
    if (!error) {
      loadActivities();
      onUpdate();
    }
    
    // Discar
    window.location.href = `tel:${cleanPhone}`;
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "WhatsApp":
        return <MessageSquare className="h-3.5 w-3.5 text-[#25D366]" />;
      case "Chamada":
        return <Phone className="h-3.5 w-3.5 text-blue-400" />;
      case "Email":
        return <Mail className="h-3.5 w-3.5 text-purple-400" />;
      case "Visita":
        return <CalendarIcon className="h-3.5 w-3.5 text-emerald-400" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <AnimatePresence>
      {open && lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-card border-l border-border z-[100] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-bold text-foreground">{lead.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {lead.vehicle_interest || 'Não informado'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${lead.negotiation_level === 'Quente' ? 'bg-red-500/20 text-red-500' : lead.negotiation_level === 'Morno' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    {lead.negotiation_level || 'Frio'}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
              {/* Atribuição de Lead (SDR) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/10 border border-white/5">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Responsável (SDR)</p>
                  {readOnly ? (
                    <p className="text-sm font-bold text-foreground">
                      {assignedTo ? lead.profiles?.full_name || sdrs.find(s => s.id === assignedTo)?.full_name || "SDR Atribuído" : "Sem SDR atribuído"}
                    </p>
                  ) : (
                    <select 
                      value={assignedTo || ""}
                      onChange={(e) => handleAssign(e.target.value || null)}
                      disabled={updatingAssignment}
                      className="bg-transparent border-none p-0 focus:outline-none text-sm font-bold text-primary cursor-pointer w-full disabled:opacity-50"
                    >
                      <option value="" className="bg-card text-foreground">Não Atribuído</option>
                      {sdrs.map(sdr => (
                        <option key={sdr.id} value={sdr.id} className="bg-card text-foreground">{sdr.full_name}</option>
                      ))}
                    </select>
                  )}
                </div>
                {!readOnly && !assignedTo && (
                  <button 
                    onClick={() => handleAssign(user?.id || null)}
                    disabled={updatingAssignment}
                    className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Puxar p/ mim
                  </button>
                )}
              </div>
              
              {/* Contatos Rápidos */}
              {!readOnly && (
                <div className="flex gap-3">
                  <button 
                    onClick={handleWhatsAppContact}
                    className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors border border-[#25D366]/20 cursor-pointer"
                  >
                    <MessageSquare className="h-5 w-5 mb-1" />
                    <span className="text-xs font-bold">WhatsApp</span>
                  </button>
                  <button 
                    onClick={handleCallContact}
                    className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors border border-blue-500/20 cursor-pointer"
                  >
                    <Phone className="h-5 w-5 mb-1" />
                    <span className="text-xs font-bold">Ligar</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab("tasks")}
                    className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors border border-purple-500/20 cursor-pointer"
                  >
                    <CalendarIcon className="h-5 w-5 mb-1" />
                    <span className="text-xs font-bold">Agendar</span>
                  </button>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="flex border-b border-white/5 bg-black/10 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("history")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === "history" 
                      ? "bg-primary text-primary-foreground shadow-glow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Histórico
                </button>
                <button
                  onClick={() => setActiveTab("tasks")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === "tasks" 
                      ? "bg-primary text-primary-foreground shadow-glow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  Compromissos
                </button>
                <button
                  onClick={() => setActiveTab("appointments")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === "appointments" 
                      ? "bg-primary text-primary-foreground shadow-glow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Visitas
                </button>
              </div>

              {activeTab === "history" && (
                <div className="space-y-6">
                  {/* Registrar Nova Nota */}
                  {(!readOnly || profile?.role === "client_store" || profile?.role === "admin" || (user?.email && ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"].includes(user.email))) && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Registrar Nota Manual
                      </label>
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="O que foi conversado com o cliente?"
                          className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-none text-foreground"
                        />
                        <button
                          onClick={() => handleAddActivity("Nota", newNote)}
                          disabled={addingNote || !newNote.trim()}
                          className="self-end bg-primary/20 text-primary hover:bg-primary/30 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Salvar Nota
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Linha do Tempo */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Linha do Tempo
                    </label>
                    {loadingActivities ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade registrada.</p>
                    ) : (
                      <div className="relative border-l border-white/10 ml-3 space-y-5">
                        {activities.map((act) => (
                          <div key={act.id} className="relative pl-6">
                            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-card border-2 border-primary" />
                            <div className="flex items-start justify-between">
                              <p className="text-xs font-bold text-foreground">{act.type}</p>
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                                <Clock className="h-3 w-3" />
                                {new Date(act.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{act.description}</p>
                            {act.profiles && act.profiles.full_name && (
                              <p className="text-[9px] text-muted-foreground/45 mt-1 uppercase font-bold">Por {act.profiles.full_name}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "tasks" && (
                <div className="space-y-6">
                  {/* Agendar Nova Tarefa */}
                  {!readOnly && (
                    <form onSubmit={handleAddTask} className="bg-black/10 border border-white/5 rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Agendar Nova Tarefa
                      </p>

                      <div className="space-y-1">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Título: Ex: Enviar fotos do veículo"
                          className="w-full bg-background border border-white/10 rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Tipo */}
                        <div className="space-y-1">
                          <select
                            value={newTaskType}
                            onChange={(e) => setNewTaskType(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1.5 text-xs text-foreground bg-card cursor-pointer"
                          >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Chamada">Ligação</option>
                            <option value="Email">E-mail</option>
                            <option value="Visita">Visita</option>
                            <option value="Tarefa">Tarefa Geral</option>
                          </select>
                        </div>

                        {/* SDR Responsável */}
                        <div className="space-y-1">
                          <select
                            value={newTaskAssignedTo}
                            onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1.5 text-xs text-foreground bg-card cursor-pointer"
                          >
                            <option value="">Não atribuído</option>
                            {sdrs.map((sdr: any) => (
                              <option key={sdr.id} value={sdr.id}>
                                {sdr.full_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Data */}
                        <div className="space-y-1">
                          <input
                            type="date"
                            value={newTaskDueDate}
                            onChange={(e) => setNewTaskDueDate(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1 text-xs text-foreground cursor-pointer"
                          />
                        </div>
                        {/* Hora */}
                        <div className="space-y-1">
                          <input
                            type="time"
                            value={newTaskDueTime}
                            onChange={(e) => setNewTaskDueTime(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1 text-xs text-foreground cursor-pointer"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={addingTask}
                        className="w-full bg-primary/20 text-primary hover:bg-primary/30 text-xs font-bold py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {addingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Agendar Compromisso
                      </button>
                    </form>
                  )}

                  {/* Listagem de Tarefas */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Compromissos Agendados
                    </p>

                    {loadingTasks ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhuma tarefa pendente ou cadastrada para este lead.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {tasks.map(t => {
                          const isOverdue = new Date(t.due_date) < new Date() && t.status === "Pendente";
                          
                          return (
                            <div 
                              key={t.id}
                              className={`flex items-start justify-between p-3 bg-white/[0.01] border rounded-xl gap-3 ${isOverdue ? "border-red-500/20 bg-red-500/[0.01]" : "border-white/5"}`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <button
                                  onClick={() => handleToggleTaskStatus(t.id, t.status, t.title)}
                                  className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 cursor-pointer"
                                >
                                  {t.status === "Pendente" ? (
                                    <Square className="h-4.5 w-4.5 opacity-70" />
                                  ) : (
                                    <CheckSquare className="h-4.5 w-4.5 text-primary" />
                                  )}
                                </button>
                                
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {getTaskIcon(t.type)}
                                    <p className={`text-xs font-bold text-foreground truncate ${t.status !== "Pendente" ? "line-through opacity-50" : ""}`}>
                                      {t.title}
                                    </p>
                                    {t.profiles?.full_name && (
                                      <span className="inline-block text-[8px] bg-white/5 border border-white/10 rounded-full px-1.5 py-0.5 text-muted-foreground uppercase font-bold">
                                        {t.profiles.full_name.split(' ')[0]}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className={`text-[9px] font-mono font-bold flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                                    <Clock className="h-2.5 w-2.5" />
                                    {new Date(t.due_date).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                    {isOverdue && <span className="uppercase text-[8px] font-black tracking-wider ml-1">Atrasada</span>}
                                  </p>
                                </div>
                              </div>

                              {!readOnly && (
                                <button
                                  onClick={() => handleDeleteTask(t.id)}
                                  className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "appointments" && (
                <div className="space-y-6">
                  {/* Agendar Nova Visita */}
                  {!readOnly && (
                    <form onSubmit={handleScheduleAppointment} className="bg-black/10 border border-white/5 rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Agendar Visita Física (Showroom)
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Data */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase">Data da Visita</label>
                          <input
                            type="date"
                            value={newApptDate}
                            onChange={(e) => setNewApptDate(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1 text-xs text-foreground cursor-pointer"
                          />
                        </div>
                        {/* Hora */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase">Horário</label>
                          <input
                            type="time"
                            value={newApptTime}
                            onChange={(e) => setNewApptTime(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-xl px-2 py-1 text-xs text-foreground cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase">Observações / Modelo de Interesse</label>
                        <textarea
                          value={newApptNotes}
                          onChange={(e) => setNewApptNotes(e.target.value)}
                          placeholder="Ex: Cliente virá ver o Corolla XEI às 14h"
                          className="w-full bg-background border border-white/10 rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none min-h-[60px] resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={schedulingAppt}
                        className="w-full bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-glow-sm cursor-pointer"
                      >
                        {schedulingAppt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Agendar Visita
                      </button>
                    </form>
                  )}

                  {/* Listagem de Visitas */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Histórico de Visitas Agendadas
                    </p>

                    {loadingAppointments ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : appointments.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhuma visita cadastrada para este lead.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {appointments.map(appt => {
                          const apptDateObj = new Date(appt.appointment_date);
                          
                          let badgeStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                          if (appt.status === "Realizado") badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                          else if (appt.status === "No-Show") badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
                          else if (appt.status === "Cancelado") badgeStyle = "bg-white/5 text-muted-foreground border-white/5";

                          return (
                            <div 
                              key={appt.id}
                              className="p-3 bg-white/[0.01] border border-white/5 rounded-xl space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                                  <p className="text-xs font-bold text-foreground">
                                    {apptDateObj.toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                  </p>
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border rounded-full ${badgeStyle}`}>
                                  {appt.status}
                                </span>
                              </div>

                              {appt.notes && (
                                <p className="text-xs text-muted-foreground leading-relaxed bg-black/20 p-2 rounded-lg border border-white/5">
                                  {appt.notes}
                                </p>
                              )}

                              {!readOnly && appt.status === "Agendado" && (
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={() => handleUpdateAppointmentStatus(appt.id, "Realizado")}
                                    className="flex-1 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition-all border border-emerald-500/20 cursor-pointer"
                                  >
                                    Compareceu
                                  </button>
                                  <button
                                    onClick={() => handleUpdateAppointmentStatus(appt.id, "No-Show")}
                                    className="flex-1 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold transition-all border border-red-500/20 cursor-pointer"
                                  >
                                    Faltou
                                  </button>
                                  <button
                                    onClick={() => handleUpdateAppointmentStatus(appt.id, "Cancelado")}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-muted-foreground text-[10px] font-bold transition-all border border-white/5 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
