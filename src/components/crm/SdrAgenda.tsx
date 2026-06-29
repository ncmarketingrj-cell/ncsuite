import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { 
  CheckSquare, 
  Square, 
  Calendar, 
  Phone, 
  MessageSquare, 
  Mail, 
  User, 
  AlertCircle,
  Loader2,
  FileText,
  Trash2,
  Plus,
  X,
  Search,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

interface SdrAgendaProps {
  clientId?: string;
  onClickLead: (lead: any) => void;
  refetchTrigger: number;
}

const TASK_TYPES = [
  { value: "WhatsApp", label: "WhatsApp",  icon: "💬" },
  { value: "Chamada",  label: "Ligação",   icon: "📞" },
  { value: "Email",    label: "E-mail",    icon: "✉️"  },
  { value: "Visita",   label: "Visita",    icon: "📅" },
  { value: "Nota",     label: "Anotação",  icon: "📝" },
];

export function SdrAgenda({ clientId, onClickLead, refetchTrigger }: SdrAgendaProps) {
  const { user } = useAuth();
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");

  // ── Modal Nova Tarefa ──────────────────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [leadSearch, setLeadSearch]     = useState("");
  const [leadResults, setLeadResults]   = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [taskType, setTaskType]         = useState("WhatsApp");
  const [taskTitle, setTaskTitle]       = useState("");
  const [taskDue, setTaskDue]           = useState("");
  const [taskNotes, setTaskNotes]       = useState("");
  const [saving, setSaving]             = useState(false);
  const [searching, setSearching]       = useState(false);
  const [sdrs, setSdrs]                 = useState<any[]>([]);
  const [taskAssignedTo, setTaskAssignedTo] = useState("");

  useEffect(() => {
    if (showModal) {
      loadSdrs();
    }
  }, [showModal, clientId]);

  const loadSdrs = async () => {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, role, client_id")
      .in("role", ["agency_sdr", "admin", "client_store"])
      .order("full_name");
    
    if (data) {
      const filtered = data.filter((p: any) => 
        p.role !== "client_store" || 
        !clientId || 
        p.client_id === clientId
      );
      setSdrs(filtered);
    }
  };

  useEffect(() => {
    if (selectedLead) {
      setTaskAssignedTo(selectedLead.assigned_to || user?.id || "");
    } else {
      setTaskAssignedTo(user?.id || "");
    }
  }, [selectedLead, user?.id]);

  useEffect(() => { fetchTasks(); }, [user?.id, activeTab, clientId, refetchTrigger]);

  // ── Buscar tarefas ──────────────────────────────────────────────────────────
  const fetchTasks = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("crm_tasks")
        .select(`
          *,
          crm_leads!inner(
            id, name, phone, email,
            vehicle_interest, client_id,
            pipeline_id, stage_id,
            negotiation_level, status,
            clients(name)
          )
        `);

      if (clientId) {
        query = query.eq("crm_leads.client_id", clientId);
      } else {
        query = query.eq("assigned_to", user.id);
      }

      if (activeTab === "pending") {
        query = query.eq("status", "Pendente");
      } else {
        query = query.in("status", ["Concluida", "Cancelada"]);
      }

      const { data, error } = await query.order("due_date", { ascending: true });

      if (error) {
        if ((error as any)?.code === "42P01") { setTasks([]); return; }
        throw error;
      }
      setTasks(data || []);
    } catch (err) {
      setTasks([]);
      console.warn("Agenda SDR: tabela crm_tasks pode ainda não estar criada no banco.", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Buscar leads para o modal ───────────────────────────────────────────────
  const handleLeadSearch = async (q: string) => {
    setLeadSearch(q);
    if (q.trim().length < 2) { setLeadResults([]); return; }
    setSearching(true);
    try {
      let query = (supabase as any)
        .from("crm_leads")
        .select("id, name, phone, vehicle_interest, assigned_to, clients(name)")
        .ilike("name", `%${q}%`)
        .limit(8);
      if (clientId) query = query.eq("client_id", clientId);
      const { data } = await query;
      setLeadResults(data || []);
    } finally {
      setSearching(false);
    }
  };

  // ── Criar tarefa ────────────────────────────────────────────────────────────
  const handleCreateTask = async () => {
    if (!selectedLead)    { toast.error("Selecione um lead."); return; }
    if (!taskTitle.trim()) { toast.error("Informe o título da tarefa."); return; }
    if (!taskDue)         { toast.error("Informe a data e hora."); return; }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from("crm_tasks").insert({
        lead_id:     selectedLead.id,
        assigned_to: taskAssignedTo || user?.id || null,
        title:       taskTitle.trim(),
        type:        taskType,
        status:      "Pendente",
        due_date:    new Date(taskDue).toISOString(),
        notes:       taskNotes.trim() || null,
      });
      if (error) throw error;
      toast.success("Tarefa criada com sucesso!");
      setShowModal(false);
      resetModal();
      fetchTasks();
    } catch (err) {
      toast.error("Erro ao criar tarefa.");
    } finally {
      setSaving(false);
    }
  };

  const resetModal = () => {
    setLeadSearch(""); setLeadResults([]); setSelectedLead(null);
    setTaskType("WhatsApp"); setTaskTitle(""); setTaskDue(""); setTaskNotes("");
    setTaskAssignedTo(user?.id || "");
  };

  // ── Concluir / Reabrir tarefa ───────────────────────────────────────────────
  const handleToggleTaskStatus = async (taskId: string, currentStatus: string, leadId: string, title: string) => {
    const newStatus    = currentStatus === "Pendente" ? "Concluida" : "Pendente";
    const actDesc      = newStatus === "Concluida" ? `Tarefa concluída: "${title}"` : `Tarefa reaberta: "${title}"`;
    try {
      const { error } = await (supabase as any)
        .from("crm_tasks")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
      toast.success(newStatus === "Concluida" ? "Tarefa concluída!" : "Tarefa reaberta.");
      await (supabase as any).from("crm_activities").insert({
        lead_id: leadId, user_id: user?.id,
        type: newStatus === "Concluida" ? "TarefaConcluida" : "TarefaReaberta",
        description: actDesc
      });
      fetchTasks();
    } catch { toast.error("Erro ao atualizar tarefa."); }
  };

  // ── Excluir tarefa ──────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Deseja realmente excluir esta tarefa?")) return;
    try {
      const { error } = await (supabase as any).from("crm_tasks").delete().eq("id", taskId);
      if (error) throw error;
      toast.success("Tarefa excluída.");
      fetchTasks();
    } catch { toast.error("Erro ao excluir tarefa."); }
  };

  const handleAgendaWhatsApp = async (task: any) => {
    const lead = task.crm_leads;
    if (!lead?.phone) {
      toast.error("Este lead não possui telefone cadastrado.");
      return;
    }
    const cleanPhone = lead.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("Telefone inválido.");
      return;
    }
    const formattedPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    
    if (task.status === "Pendente") {
      if (window.confirm(`Deseja iniciar o WhatsApp e já marcar a tarefa como CONCLUÍDA?`)) {
        await handleToggleTaskStatus(task.id, task.status, lead.id, task.title);
      }
    }
    
    window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}`, "_blank");
  };

  const handleAgendaCall = async (task: any) => {
    const lead = task.crm_leads;
    if (!lead?.phone) {
      toast.error("Este lead não possui telefone cadastrado.");
      return;
    }
    const cleanPhone = lead.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("Telefone inválido.");
      return;
    }
    
    if (task.status === "Pendente") {
      if (window.confirm(`Deseja efetuar a ligação e já marcar a tarefa como CONCLUÍDA?`)) {
        await handleToggleTaskStatus(task.id, task.status, lead.id, task.title);
      }
    }
    
    window.location.href = `tel:${cleanPhone}`;
  };

  // ── Ícone por tipo ──────────────────────────────────────────────────────────
  const getTaskIcon = (type: string) => {
    switch (type) {
      case "WhatsApp": return <MessageSquare className="h-4 w-4 text-[#25D366]" />;
      case "Chamada":  return <Phone className="h-4 w-4 text-blue-400" />;
      case "Email":    return <Mail className="h-4 w-4 text-purple-400" />;
      case "Visita":   return <Calendar className="h-4 w-4 text-emerald-400" />;
      default:         return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // ── Classificar prazos ──────────────────────────────────────────────────────
  const now = new Date();
  const overdueTasks = tasks.filter(t => new Date(t.due_date) < now && t.status === "Pendente");
  const todayTasks   = tasks.filter(t => {
    const d = new Date(t.due_date);
    return t.status === "Pendente" &&
      d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const futureTasks  = tasks.filter(t => {
    const d = new Date(t.due_date);
    if (t.status !== "Pendente") return false;
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return d > now && !isToday;
  });

  // ── Render linha de tarefa ──────────────────────────────────────────────────
  const renderTaskRow = (task: any) => {
    const lead      = task.crm_leads;
    const isOverdue = new Date(task.due_date) < now && task.status === "Pendente";
    const fmtDate   = new Date(task.due_date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    return (
      <div
        key={task.id}
        className={`flex items-center justify-between p-3.5 bg-card border rounded-2xl hover:border-white/20 transition-all gap-4 ${isOverdue ? "border-red-500/20 bg-red-500/[0.01]" : "border-white/10"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => handleToggleTaskStatus(task.id, task.status, lead.id, task.title)}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-transform active:scale-95 cursor-pointer"
          >
            {task.status === "Pendente"
              ? <Square className="h-5 w-5 opacity-70" />
              : <CheckSquare className="h-5 w-5 text-primary" />}
          </button>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {getTaskIcon(task.type)}
              <span className={`text-xs font-bold text-foreground truncate ${task.status !== "Pendente" ? "line-through opacity-50" : ""}`}>
                {task.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <button onClick={() => onClickLead(lead)} className="flex items-center gap-1 font-bold text-primary hover:underline cursor-pointer">
                <User className="h-3 w-3" /> {lead?.name}
              </button>
              {lead?.vehicle_interest && (
                <>
                  <span className="w-1 h-1 bg-white/20 rounded-full" />
                  <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold">{lead.vehicle_interest}</span>
                </>
              )}
              {lead?.clients?.name && (
                <>
                  <span className="w-1 h-1 bg-white/20 rounded-full" />
                  <span>Loja: {lead.clients.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lead?.phone && task.status === "Pendente" && (
            <div className="flex gap-1.5 mr-1">
              {task.type === "WhatsApp" && (
                <button
                  onClick={() => handleAgendaWhatsApp(task)}
                  title="Conversar no WhatsApp"
                  className="text-[#25D366] hover:bg-[#25D366]/10 p-1.5 rounded-lg border border-[#25D366]/20 transition-all cursor-pointer flex items-center justify-center"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              )}
              {task.type === "Chamada" && (
                <button
                  onClick={() => handleAgendaCall(task)}
                  title="Fazer ligação telefônica"
                  className="text-blue-400 hover:bg-blue-400/10 p-1.5 rounded-lg border border-blue-400/20 transition-all cursor-pointer flex items-center justify-center"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="text-right">
            <p className={`text-[10px] font-mono font-bold flex items-center gap-1 justify-end ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
              {isOverdue && <AlertCircle className="h-3 w-3 animate-pulse" />}
              {fmtDate}
            </p>
            {isOverdue && <p className="text-[8px] text-red-500 uppercase tracking-widest font-black">Atrasada</p>}
          </div>
          <button onClick={() => handleDeleteTask(task.id)} className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // ── Render principal ────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-5">

        {/* Header com botão Nova Tarefa */}
        <div className="flex items-center justify-between">
          <div className="flex border-b border-white/5 pb-px flex-1">
            <button
              onClick={() => setActiveTab("pending")}
              className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${activeTab === "pending" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Pendentes ({tasks.filter(t => t.status === "Pendente").length})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${activeTab === "completed" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Concluídas ({tasks.filter(t => t.status !== "Pendente").length})
            </button>
          </div>

          <button
            onClick={() => { resetModal(); setShowModal(true); }}
            className="ml-4 flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 text-xs font-black transition-all shadow-lg shadow-primary/20 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Tarefa
          </button>
        </div>

        {/* Conteúdo das abas */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {activeTab === "pending" ? (
              <>
                {overdueTasks.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-500">
                      <AlertCircle className="h-4 w-4 animate-pulse" />
                      <h4 className="text-xs font-black uppercase tracking-widest">Atrasadas ({overdueTasks.length})</h4>
                    </div>
                    <div className="space-y-2">{overdueTasks.map(renderTaskRow)}</div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Hoje ({todayTasks.length})</h4>
                  {todayTasks.length === 0 ? (
                    <div className="p-4 border border-dashed border-white/5 rounded-2xl text-center text-xs text-muted-foreground">
                      Sem tarefas para hoje. Bom trabalho! 🎯
                    </div>
                  ) : (
                    <div className="space-y-2">{todayTasks.map(renderTaskRow)}</div>
                  )}
                </div>

                {futureTasks.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Próximas ({futureTasks.length})</h4>
                    <div className="space-y-2">{futureTasks.map(renderTaskRow)}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <div className="p-8 border border-dashed border-white/5 rounded-2xl text-center text-xs text-muted-foreground">
                    Nenhuma tarefa concluída no histórico recente.
                  </div>
                ) : (
                  tasks.map(renderTaskRow)
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Nova Tarefa ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">Nova Tarefa</h3>
                  <p className="text-[10px] text-muted-foreground">Crie uma atividade vinculada a um lead</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh] custom-scrollbar">

              {/* Buscar Lead */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Lead Vinculado *</label>
                {selectedLead ? (
                  <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-primary">{selectedLead.name}</p>
                      {selectedLead.vehicle_interest && (
                        <p className="text-[10px] text-muted-foreground">{selectedLead.vehicle_interest}</p>
                      )}
                    </div>
                    <button onClick={() => { setSelectedLead(null); setLeadSearch(""); setLeadResults([]); }} className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar por nome do lead..."
                      value={leadSearch}
                      onChange={e => handleLeadSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-xs rounded-xl pl-9 pr-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {leadResults.length > 0 && (
                       <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                        {leadResults.map((l: any) => (
                          <button
                            key={l.id}
                            onClick={() => { setSelectedLead(l); setLeadSearch(""); setLeadResults([]); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 cursor-pointer"
                          >
                            <p className="text-xs font-bold text-foreground">{l.name}</p>
                            <p className="text-[10px] text-muted-foreground">{l.vehicle_interest || l.phone || "—"} {l.clients?.name ? `· ${l.clients.name}` : ""}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tipo de tarefa */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tipo de Atividade *</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {TASK_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setTaskType(t.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all cursor-pointer ${taskType === t.value ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"}`}
                    >
                      <span className="text-base">{t.icon}</span>
                      <span className="text-[9px] font-black">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SDR Responsável */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">SDR Responsável *</label>
                <select
                  value={taskAssignedTo}
                  onChange={e => setTaskAssignedTo(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-card cursor-pointer"
                >
                  <option value="">Não atribuído</option>
                  {sdrs.map((sdr: any) => (
                    <option key={sdr.id} value={sdr.id}>
                      {sdr.full_name} ({sdr.role === 'admin' ? 'Admin' : sdr.role === 'agency_sdr' ? 'SDR Agência' : 'Cliente'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Título */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Título da Tarefa *</label>
                <input
                  type="text"
                  placeholder={`Ex: ${taskType === "WhatsApp" ? "Enviar proposta no WhatsApp" : taskType === "Chamada" ? "Ligar para confirmar visita" : taskType === "Email" ? "Enviar e-mail com ficha" : taskType === "Visita" ? "Receber cliente no showroom" : "Registrar observação"}`}
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Data e Hora */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Data e Hora *</label>
                <input
                  type="datetime-local"
                  value={taskDue}
                  onChange={e => setTaskDue(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]"
                />
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Observações</label>
                <textarea
                  rows={3}
                  placeholder="Detalhe a atividade, o que foi combinado, etc..."
                  value={taskNotes}
                  onChange={e => setTaskNotes(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-white/10 hover:bg-white/5 text-foreground text-xs font-bold rounded-xl transition-colors cursor-pointer">
                Cancelar
              </button>
              <button
                onClick={handleCreateTask}
                disabled={saving}
                className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? "Salvando..." : "Criar Tarefa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
