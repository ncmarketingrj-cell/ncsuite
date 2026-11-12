import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, ShieldAlert, Sparkles, Plus, Search, ChevronDown,
  CheckCircle2, AlertTriangle, AlertCircle, Info, Pin, PinOff,
  Trash2, Edit3, ExternalLink, ArrowRight, Brain, Filter, Check,
  Copy, Eye, TrendingUp, DollarSign, Megaphone, Users, RefreshCw,
  X, Calendar as CalendarIcon, Store, ShieldCheck, Zap
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useAccountRules, useAccountNotes, type AccountRule, type AccountNote, type RuleSeverity, type RuleType } from "@/hooks/useAccountRulesAndNotes";
import { listMindMapsByAccount, createNewMindMap, type MindMapRecord } from "@/components/mindmap/mindMapService";

export const Route = createFileRoute("/_app/regras")({
  head: () => ({ meta: [{ title: "Estratégia, Regras & Notas — NC Suite" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    account: (s.account as string) || (s.accountId as string) || undefined,
    campaign: (s.campaign as string) || undefined,
  }),
  component: RegrasPage,
});

const NOTE_CATEGORIES = ["Todos", "Geral", "Campanha", "Reunião", "Briefing", "Ajuste", "Criativo", "Escala", "Financeiro"];
const NOTE_CAT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Geral:      { bg: "bg-muted/40", text: "text-muted-foreground", border: "border-border" },
  Campanha:   { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  Reunião:    { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  Briefing:   { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  Ajuste:     { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  Criativo:   { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  Escala:     { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  Financeiro: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
};

const RULE_TYPES = ["Todas", "Escala", "Pausamento", "Criativos", "Atendimento", "Orçamento", "Geral"];

const SEVERITY_INFO: Record<RuleSeverity, { label: string; bg: string; text: string; border: string; icon: any }> = {
  critica:     { label: "Crítica / Inegociável", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", icon: ShieldAlert },
  alerta:      { label: "Atenção / Limite", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", icon: AlertTriangle },
  diretriz:    { label: "Diretriz Operacional", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", icon: Info },
  boa_pratica: { label: "Boa Prática", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", icon: CheckCircle2 },
};

function RegrasPage() {
  const searchParams = useSearch({ strict: false }) as { account?: string; campaign?: string; accountId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── 1. Contas de Anúncio e Clientes Vinculados ──────────────────────────────
  const { data: adAccounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: ["ad_accounts_list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_accounts")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients_for_accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, name, meta_ad_account_id, logo_url");
      if (error) return [];
      return data || [];
    },
  });

  const clientByAccount = useMemo(() => {
    const map = new Map<string, any>();
    clients.forEach((c: any) => {
      if (c.meta_ad_account_id) map.set(c.meta_ad_account_id, c);
    });
    return map;
  }, [clients]);

  // Conta selecionada
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (searchParams.account) return searchParams.account;
    return "";
  });

  useEffect(() => {
    if (searchParams.account) {
      setSelectedAccountId(searchParams.account);
    } else if (!selectedAccountId && adAccounts.length > 0) {
      setSelectedAccountId(adAccounts[0].id);
    }
  }, [searchParams.account, adAccounts]);

  const currentAccount = useMemo(() => {
    return adAccounts.find((a: any) => a.id === selectedAccountId) || null;
  }, [adAccounts, selectedAccountId]);

  const currentClient = useMemo(() => {
    return selectedAccountId ? clientByAccount.get(selectedAccountId) : null;
  }, [clientByAccount, selectedAccountId]);

  // Campanhas ativas da conta
  const { data: campaigns = [] } = useQuery({
    queryKey: ["account_campaigns", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await (supabase as any)
        .from("campaigns")
        .select("id, name, status, external_id")
        .eq("ad_account_id", selectedAccountId)
        .order("name", { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  // ── 2. Filtro de Datas com DateRangePicker ──────────────────────────────────
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(new Date().setDate(new Date().getDate() - 29)),
    end: new Date(),
  });

  // ── 3. Regras & Diretrizes ──────────────────────────────────────────────────
  const {
    rules,
    isLoading: isLoadingRules,
    createRule,
    updateRule,
    toggleRule,
    deleteRule,
  } = useAccountRules(selectedAccountId);

  const [ruleTypeFilter, setRuleTypeFilter] = useState("Todas");
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AccountRule | null>(null);
  const [ruleFormData, setRuleFormData] = useState({
    title: "",
    description: "",
    type: "Geral",
    severity: "alerta" as RuleSeverity,
    campaign_id: "",
    campaign_name: "",
    is_active: true,
  });

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (ruleTypeFilter === "Todas") return true;
      return r.type?.toLowerCase() === ruleTypeFilter.toLowerCase();
    });
  }, [rules, ruleTypeFilter]);

  const openCreateRuleModal = () => {
    setEditingRule(null);
    setRuleFormData({
      title: "",
      description: "",
      type: "Geral",
      severity: "alerta",
      campaign_id: "",
      campaign_name: "",
      is_active: true,
    });
    setShowRuleModal(true);
  };

  const openEditRuleModal = (rule: AccountRule) => {
    setEditingRule(rule);
    setRuleFormData({
      title: rule.title,
      description: rule.description,
      type: rule.type || "Geral",
      severity: rule.severity || "alerta",
      campaign_id: rule.campaign_id || "",
      campaign_name: rule.campaign_name || "",
      is_active: rule.is_active,
    });
    setShowRuleModal(true);
  };

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleFormData.title.trim() || !ruleFormData.description.trim()) {
      toast.error("Preencha título e descrição da regra.");
      return;
    }

    const campaignObj = campaigns.find((c: any) => c.id === ruleFormData.campaign_id || c.external_id === ruleFormData.campaign_id);

    if (editingRule) {
      await updateRule.mutateAsync({
        id: editingRule.id,
        updates: {
          title: ruleFormData.title,
          description: ruleFormData.description,
          type: ruleFormData.type,
          severity: ruleFormData.severity,
          campaign_id: ruleFormData.campaign_id || null,
          campaign_name: campaignObj?.name || null,
          is_active: ruleFormData.is_active,
        },
      });
    } else {
      await createRule.mutateAsync({
        ad_account_id: selectedAccountId,
        title: ruleFormData.title,
        description: ruleFormData.description,
        type: ruleFormData.type,
        severity: ruleFormData.severity,
        campaign_id: ruleFormData.campaign_id || null,
        campaign_name: campaignObj?.name || null,
        is_active: ruleFormData.is_active,
      });
    }

    setShowRuleModal(false);
  };

  // ── 4. Histórico de Notas & Timeline ────────────────────────────────────────
  const {
    notes,
    isLoading: isLoadingNotes,
    createNote,
    updateNote,
    togglePinNote,
    deleteNote,
  } = useAccountNotes(selectedAccountId);

  const [noteCategoryFilter, setNoteCategoryFilter] = useState("Todos");
  const [noteCampaignFilter, setNoteCampaignFilter] = useState("all");
  const [searchNoteText, setSearchNoteText] = useState("");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<AccountNote | null>(null);
  const [noteFormData, setNoteFormData] = useState({
    title: "",
    content: "",
    category: "Geral",
    campaign_id: "",
    campaign_name: "",
    tagsStr: "",
    is_pinned: false,
    note_date: format(new Date(), "yyyy-MM-dd"),
  });

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // 1. Categoria
      if (noteCategoryFilter !== "Todos" && n.category?.toLowerCase() !== noteCategoryFilter.toLowerCase()) {
        return false;
      }
      // 2. Campanha
      if (noteCampaignFilter !== "all" && n.campaign_id !== noteCampaignFilter) {
        return false;
      }
      // 3. Busca texto
      if (searchNoteText.trim()) {
        const query = searchNoteText.toLowerCase();
        const inTitle = n.title?.toLowerCase().includes(query);
        const inContent = n.content?.toLowerCase().includes(query);
        const inTags = n.tags?.some((t) => t.toLowerCase().includes(query));
        if (!inTitle && !inContent && !inTags) return false;
      }
      // 4. Data dentro do DateRangePicker
      if (n.note_date) {
        try {
          const d = parseISO(n.note_date);
          const within = isWithinInterval(d, {
            start: startOfDay(dateRange.start),
            end: endOfDay(dateRange.end),
          });
          if (!within) return false;
        } catch {}
      }
      return true;
    });
  }, [notes, noteCategoryFilter, noteCampaignFilter, searchNoteText, dateRange]);

  const openCreateNoteModal = () => {
    setEditingNote(null);
    setNoteFormData({
      title: "",
      content: "",
      category: "Geral",
      campaign_id: "",
      campaign_name: "",
      tagsStr: "",
      is_pinned: false,
      note_date: format(new Date(), "yyyy-MM-dd"),
    });
    setShowNoteModal(true);
  };

  const openEditNoteModal = (note: AccountNote) => {
    setEditingNote(note);
    setNoteFormData({
      title: note.title,
      content: note.content,
      category: note.category || "Geral",
      campaign_id: note.campaign_id || "",
      campaign_name: note.campaign_name || "",
      tagsStr: (note.tags || []).join(", "),
      is_pinned: note.is_pinned,
      note_date: note.note_date || format(new Date(), "yyyy-MM-dd"),
    });
    setShowNoteModal(true);
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteFormData.title.trim() || !noteFormData.content.trim()) {
      toast.error("Preencha título e conteúdo da nota.");
      return;
    }

    const tags = noteFormData.tagsStr
      ? noteFormData.tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const campaignObj = campaigns.find((c: any) => c.id === noteFormData.campaign_id || c.external_id === noteFormData.campaign_id);

    if (editingNote) {
      await updateNote.mutateAsync({
        id: editingNote.id,
        updates: {
          title: noteFormData.title,
          content: noteFormData.content,
          category: noteFormData.category,
          campaign_id: noteFormData.campaign_id || null,
          campaign_name: campaignObj?.name || null,
          tags,
          is_pinned: noteFormData.is_pinned,
          note_date: noteFormData.note_date,
        },
      });
    } else {
      await createNote.mutateAsync({
        ad_account_id: selectedAccountId,
        title: noteFormData.title,
        content: noteFormData.content,
        category: noteFormData.category,
        campaign_id: noteFormData.campaign_id || null,
        campaign_name: campaignObj?.name || null,
        tags,
        is_pinned: noteFormData.is_pinned,
        note_date: noteFormData.note_date,
      });
    }

    setShowNoteModal(false);
  };

  // ── 5. Mapas Mentais da Conta ───────────────────────────────────────────────
  const { data: accountMindMaps = [], refetch: refetchMaps } = useQuery({
    queryKey: ["account_mind_maps", selectedAccountId],
    queryFn: async (): Promise<MindMapRecord[]> => {
      if (!selectedAccountId) return [];
      return await listMindMapsByAccount(selectedAccountId);
    },
    enabled: !!selectedAccountId,
  });

  const handleCreateMindMapForAccount = async () => {
    if (!selectedAccountId) return;
    const accountName = currentAccount?.name || "Conta";
    try {
      const res = await createNewMindMap(
        `Estratégia & Funil — ${accountName}`,
        null,
        "radial",
        selectedAccountId
      );
      toast.success("Novo Mapa Mental criado para a conta!");
      refetchMaps();
      navigate({ to: "/strategy-map" as any, search: { account: selectedAccountId, mapId: res.map.id } as any });
    } catch (err: any) {
      toast.error("Erro ao criar mapa: " + (err?.message || ""));
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER: Seletor de Conta + Indicadores + DateRangePicker
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-5 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Seletor da Conta */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl border border-primary/20 bg-primary/10 flex items-center justify-center shrink-0 shadow-glow-sm">
              {currentClient?.logo_url ? (
                <img src={currentClient.logo_url} alt="" className="h-full w-full object-cover rounded-2xl" />
              ) : (
                <ShieldAlert className="h-6 w-6 text-primary" />
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                <Store className="h-3 w-3" /> Gestão Estratégica & Regras Operacionais
              </span>
              <div className="relative mt-0.5">
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    navigate({
                      to: "/regras" as any,
                      search: { account: e.target.value } as any,
                    });
                  }}
                  className="appearance-none font-display font-black text-lg md:text-xl bg-transparent pr-8 text-foreground cursor-pointer focus:outline-none hover:text-primary transition-colors"
                >
                  {adAccounts.map((acc: any) => {
                    const client = clientByAccount.get(acc.id);
                    return (
                      <option key={acc.id} value={acc.id} className="bg-card text-foreground font-sans text-sm font-semibold">
                        {acc.name} {client ? `(${client.name})` : ""}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* DateRangePicker Dinâmico e Moderno */}
          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              onChange={(start, end) => setDateRange({ start, end })}
            />

            <button
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["ad_account_rules"] });
                qc.invalidateQueries({ queryKey: ["ad_account_notes"] });
                qc.invalidateQueries({ queryKey: ["account_mind_maps"] });
                toast.success("Dados da conta sincronizados!");
              }}
              title="Recarregar dados"
              className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick KPI Strip & Links Rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2.5 rounded-xl bg-background/50 border border-border/60 p-2.5">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Regras Ativas</p>
              <p className="text-sm font-black text-foreground">{rules.filter((r) => r.is_active).length} / {rules.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl bg-background/50 border border-border/60 p-2.5">
            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Notas Filtradas</p>
              <p className="text-sm font-black text-foreground">{filteredNotes.length}</p>
            </div>
          </div>

          <Link
            to="/metricas"
            search={{ account: selectedAccountId }}
            className="flex items-center justify-between rounded-xl bg-background/50 border border-border/60 p-2.5 hover:border-primary/40 hover:bg-primary/5 transition-all group"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Ir para Métricas</p>
                <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">Ver Campanhas</p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-transform" />
          </Link>

          <Link
            to="/strategy-map"
            search={{ account: selectedAccountId } as any}
            className="flex items-center justify-between rounded-xl bg-background/50 border border-border/60 p-2.5 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400 shrink-0" />
              <div>
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Strategy Map</p>
                <p className="text-xs font-black text-foreground group-hover:text-purple-400 transition-colors">
                  {accountMindMaps.length} {accountMindMaps.length === 1 ? "Mapa" : "Mapas"}
                </p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-1 group-hover:text-purple-400 transition-transform" />
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          DUAS COLUNAS PRINCIPAIS: HISTÓRICO DE NOTAS & REGRAS OPERACIONAIS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── COLUNA ESQUERDA (7 colunas): TIMELINE E NOTAS DIÁRIAS ────────────── */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-primary" /> Histórico de Notas & Timeline Diária
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Registros de reuniões, alinhamentos, alterações de campanha e decisões estratégicas.
              </p>
            </div>

            <button
              onClick={openCreateNoteModal}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground hover:opacity-90 shadow-glow-sm transition-all whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" /> Nova Nota
            </button>
          </div>

          {/* Filtros da Timeline: Busca, Categorias e Filtro de Campanha */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar nas notas e tags..."
                  value={searchNoteText}
                  onChange={(e) => setSearchNoteText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-xs font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
              </div>

              {campaigns.length > 0 && (
                <div className="w-full sm:w-auto shrink-0">
                  <select
                    value={noteCampaignFilter}
                    onChange={(e) => setNoteCampaignFilter(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="all">Todas as Campanhas</option>
                    {campaigns.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Categorias Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {NOTE_CATEGORIES.map((cat) => {
                const isSelected = noteCategoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setNoteCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Notas na Timeline */}
          {isLoadingNotes ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-mono">Carregando timeline...</div>
          ) : filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center space-y-3">
              <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <div>
                <p className="text-sm font-bold text-foreground">Nenhuma nota encontrada no período</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Utilize o botão "+ Nova Nota" acima para documentar briefings, alinhamentos ou decisões operacionais desta conta.
                </p>
              </div>
              <button
                onClick={openCreateNoteModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-black text-primary hover:bg-primary hover:text-primary-foreground transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Primeira Nota
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => {
                const catStyle = NOTE_CAT_STYLE[note.category] || NOTE_CAT_STYLE.Geral;
                return (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative rounded-2xl border bg-card p-4 transition-all hover:shadow-md ${
                      note.is_pinned ? "border-primary/40 bg-primary/[0.02]" : "border-border"
                    }`}
                  >
                    {/* Top line: Pinned, Category, Campaign, Date, Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {note.is_pinned && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-[10px] font-black text-primary uppercase">
                            <Pin className="h-3 w-3 fill-primary" /> Fixada
                          </span>
                        )}

                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                          {note.category}
                        </span>

                        {note.campaign_name && (
                          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                            <Megaphone className="h-2.5 w-2.5" /> {note.campaign_name}
                          </span>
                        )}

                        <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3 text-muted-foreground/60" />
                          {note.note_date ? format(parseISO(note.note_date), "dd 'de' MMM, yyyy", { locale: ptBR }) : ""}
                        </span>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePinNote.mutate({ id: note.id, is_pinned: !note.is_pinned })}
                          title={note.is_pinned ? "Desafixar nota" : "Fixar nota no topo"}
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {note.is_pinned ? <PinOff className="h-3.5 w-3.5 text-primary" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => openEditNoteModal(note)}
                          title="Editar nota"
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Deseja realmente remover esta nota?")) {
                              deleteNote.mutate(note.id);
                            }
                          }}
                          title="Excluir nota"
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-destructive/30 hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Título & Conteúdo */}
                    <h3 className="text-sm font-black text-foreground mt-2 leading-tight">
                      {note.title}
                    </h3>

                    <div className="mt-2 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans bg-background/40 rounded-xl p-3 border border-border/40">
                      {note.content}
                    </div>

                    {/* Tags */}
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-2 border-t border-border/40">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA (5 colunas): REGRAS DA CONTA & POLÍTICAS ───────────── */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-2 text-foreground">
                <ShieldAlert className="h-4 w-4 text-red-500" /> Regras da Conta & Diretrizes
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Políticas operacionais inegociáveis para o time desta conta.
              </p>
            </div>

            <button
              onClick={openCreateRuleModal}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-black text-white hover:bg-red-700 shadow-glow-sm transition-all whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" /> Nova Regra
            </button>
          </div>

          {/* Filtro de Tipo de Regra */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {RULE_TYPES.map((type) => {
              const isSelected = ruleTypeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => setRuleTypeFilter(type)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? "bg-red-600 text-white border-red-600 shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>

          {/* Lista de Regras */}
          {isLoadingRules ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-mono">Carregando regras...</div>
          ) : filteredRules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center space-y-3">
              <ShieldAlert className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <div>
                <p className="text-sm font-bold text-foreground">Nenhuma regra cadastrada nesta categoria</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Crie regras de escala, pausamento, regras de criativos ou diretrizes que o time de tráfego nunca deve violar.
                </p>
              </div>
              <button
                onClick={openCreateRuleModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-black text-red-500 hover:bg-red-600 hover:text-white transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Primeira Regra
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRules.map((rule) => {
                const sev = SEVERITY_INFO[rule.severity] || SEVERITY_INFO.alerta;
                const SevIcon = sev.icon;
                return (
                  <motion.div
                    key={rule.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative rounded-2xl border bg-card p-4 transition-all hover:shadow-md ${
                      rule.is_active ? sev.border : "border-border opacity-70"
                    }`}
                  >
                    {/* Header do Card: Severidade, Categoria, Toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase border ${sev.bg} ${sev.text} ${sev.border}`}>
                          <SevIcon className="h-3 w-3" /> {sev.label}
                        </span>

                        <span className="rounded-full bg-muted/60 border border-border px-2.5 py-0.5 text-[10px] font-bold text-foreground">
                          {rule.type || "Geral"}
                        </span>

                        {rule.campaign_name && (
                          <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                            {rule.campaign_name}
                          </span>
                        )}
                      </div>

                      {/* Switch Ativo/Inativo */}
                      <button
                        onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          rule.is_active ? "bg-emerald-500" : "bg-muted"
                        }`}
                        title={rule.is_active ? "Regra Ativa — clique para pausar" : "Regra Pausada — clique para ativar"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            rule.is_active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Título & Descrição */}
                    <h3 className="text-sm font-black text-foreground mt-2 leading-tight">
                      {rule.title}
                    </h3>

                    <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed bg-background/50 rounded-xl p-3 border border-border/40 font-mono">
                      {rule.description}
                    </p>

                    {/* Footer do Card com Ações */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-[11px]">
                      <span className="text-[10px] text-muted-foreground">
                        {rule.is_active ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ativa na operação
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Pausada</span>
                        )}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${rule.title}: ${rule.description}`);
                            toast.success("Regra copiada para a área de transferência!");
                          }}
                          title="Copiar regra"
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEditRuleModal(rule)}
                          title="Editar regra"
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Deseja realmente remover esta regra?")) {
                              deleteRule.mutate(rule.id);
                            }
                          }}
                          title="Excluir regra"
                          className="h-7 w-7 rounded-lg border border-transparent hover:border-destructive/30 hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEÇÃO INTEGRADA: MAPAS MENTAIS & ESTRUTURA ESTRATÉGICA DA CONTA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-card to-purple-950/10 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-foreground flex items-center gap-2">
                Mapas Mentais & Estratégia de Funil da Conta
              </h2>
              <p className="text-xs text-muted-foreground">
                Jornadas visuais, hipóteses de público e funis conectados diretamente a esta conta de anúncio.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCreateMindMapForAccount}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-black text-white hover:bg-purple-700 shadow-glow-sm transition-all whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" /> Novo Mapa para esta Conta
            </button>

            <Link
              to="/strategy-map"
              search={{ account: selectedAccountId } as any}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted/50 transition-colors whitespace-nowrap"
            >
              Abrir Strategy Map <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>
        </div>

        {/* Grade de Mapas da Conta */}
        {accountMindMaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-purple-500/20 bg-background/40 p-6 text-center space-y-2">
            <p className="text-xs font-bold text-muted-foreground">
              Nenhum mapa mental associado a esta conta ainda.
            </p>
            <p className="text-[11px] text-muted-foreground/70 max-w-md mx-auto">
              Crie um mapa mental dedicado para organizar o funil de tráfego, criativos testados e regras de conversão desta conta.
            </p>
            <button
              onClick={handleCreateMindMapForAccount}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3.5 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-600 hover:text-white transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Criar Primeiro Mapa Mental
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accountMindMaps.map((map) => (
              <div
                key={map.id}
                className="rounded-xl border border-purple-500/20 bg-card/80 p-3.5 flex flex-col justify-between hover:border-purple-500/40 hover:shadow-md transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-black text-foreground group-hover:text-purple-400 transition-colors line-clamp-1">
                      {map.title}
                    </h4>
                    <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-mono text-purple-400 font-bold shrink-0">
                      {map.node_count || 1} tópicos
                    </span>
                  </div>
                  {map.description && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {map.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                  <span>Atualizado {format(parseISO(map.updated_at), "dd/MM/yyyy")}</span>
                  <Link
                    to="/strategy-map"
                    search={{ account: selectedAccountId, mapId: map.id } as any}
                    className="flex items-center gap-1 font-bold text-purple-400 hover:underline"
                  >
                    Abrir Mapa <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR NOTA
          ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {editingNote ? "Editar Nota da Timeline" : "Nova Nota na Timeline"}
                </h3>
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitNote} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Título da Nota *
                  </label>
                  <input
                    type="text"
                    required
                    value={noteFormData.title}
                    onChange={(e) => setNoteFormData((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex: Alinhamento de Escala & Troca de Criativos"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Categoria
                    </label>
                    <select
                      value={noteFormData.category}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, category: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary/50"
                    >
                      {NOTE_CATEGORIES.filter((c) => c !== "Todos").map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Data do Registro
                    </label>
                    <input
                      type="date"
                      value={noteFormData.note_date}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, note_date: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                {campaigns.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Campanha Vinculada (Opcional)
                    </label>
                    <select
                      value={noteFormData.campaign_id}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">Geral (Conta inteira)</option>
                      {campaigns.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Conteúdo / Detalhamento *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={noteFormData.content}
                    onChange={(e) => setNoteFormData((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Descreva o alinhamento, ajustes realizados, aprendizados do dia..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Tags (separadas por vírgula)
                    </label>
                    <input
                      type="text"
                      value={noteFormData.tagsStr}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, tagsStr: e.target.value }))}
                      placeholder="escala, criativo-v1, roas"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="is_pinned_cb"
                      checked={noteFormData.is_pinned}
                      onChange={(e) => setNoteFormData((p) => ({ ...p, is_pinned: e.target.checked }))}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="is_pinned_cb" className="text-xs font-bold text-foreground cursor-pointer select-none">
                      Fixar esta nota no topo
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowNoteModal(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted/50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createNote.isPending || updateNote.isPending}
                    className="rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {editingNote ? "Salvar Alterações" : "Adicionar Nota"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR REGRA OPERACIONAL
          ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showRuleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  {editingRule ? "Editar Regra Operacional" : "Nova Regra Operacional"}
                </h3>
                <button
                  onClick={() => setShowRuleModal(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitRule} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Nome / Título da Regra *
                  </label>
                  <input
                    type="text"
                    required
                    value={ruleFormData.title}
                    onChange={(e) => setRuleFormData((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex: CPL Máximo R$ 5,00 — Pausar se ultrapassar"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Severidade / Impacto
                    </label>
                    <select
                      value={ruleFormData.severity}
                      onChange={(e) => setRuleFormData((p) => ({ ...p, severity: e.target.value as RuleSeverity }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="critica">Crítica / Inegociável (Vermelho)</option>
                      <option value="alerta">Atenção / Limite (Amarelo)</option>
                      <option value="diretriz">Diretriz Operacional (Azul)</option>
                      <option value="boa_pratica">Boa Prática (Verde)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Tipo de Regra
                    </label>
                    <select
                      value={ruleFormData.type}
                      onChange={(e) => setRuleFormData((p) => ({ ...p, type: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary/50"
                    >
                      {RULE_TYPES.filter((t) => t !== "Todas").map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {campaigns.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Escopo / Campanha Específica (Opcional)
                    </label>
                    <select
                      value={ruleFormData.campaign_id}
                      onChange={(e) => setRuleFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">Aplica-se a TODAS as Campanhas desta Conta</option>
                      {campaigns.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Descrição da Diretriz / O que fazer *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={ruleFormData.description}
                    onChange={(e) => setRuleFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Instruções claras para o operador: Ex: Se a campanha gastar mais de R$ 20 sem conversão até as 15h, pausar imediatamente e avisar no grupo."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_active_cb"
                    checked={ruleFormData.is_active}
                    onChange={(e) => setRuleFormData((p) => ({ ...p, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-border text-red-600 focus:ring-red-600"
                  />
                  <label htmlFor="is_active_cb" className="text-xs font-bold text-foreground cursor-pointer select-none">
                    Regra Ativa imediatamente
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowRuleModal(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted/50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createRule.isPending || updateRule.isPending}
                    className="rounded-xl bg-red-600 px-5 py-2 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {editingRule ? "Salvar Alterações" : "Criar Regra"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
