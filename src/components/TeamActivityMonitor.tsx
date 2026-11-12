import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Calendar,
  Clock,
  Eye,
  Monitor,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  Wifi,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  History,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserAvatar, type AvatarPresenceStatus } from "@/components/UserAvatar";
import { getHierarchyInfo } from "@/lib/userHierarchy";
import {
  fetchTeamActivitySnapshot,
  fetchUserWorkflowTrail,
  formatDurationCompact,
  getLocalIsoDate,
  isUserOnlineNow,
  type ActivityDailyRecord,
} from "@/lib/activityPixelService";

type StatusFilter = "todos" | "online" | "acessaram" | "ausentes";
type MonitorView = "diario" | "matriz";

function formatShortBrDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}`;
}

function formatTimeOnly(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return "—";
  try {
    return new Date(isoTimestamp).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function TeamActivityMonitor() {
  const todayIso = useMemo(() => getLocalIsoDate(), []);
  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalIsoDate(d);
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [matrixDays, setMatrixDays] = useState<7 | 14>(7);
  const [viewMode, setViewMode] = useState<MonitorView>("diario");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [search, setSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const isViewingToday = selectedDate === todayIso;

  const {
    data: snapshot,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["team_activity_monitor", selectedDate, matrixDays],
    queryFn: () => fetchTeamActivitySnapshot({ selectedDate, matrixDays }),
    refetchInterval: isViewingToday ? 20_000 : false,
  });

  const { data: expandedTrail = [], isLoading: trailLoading } = useQuery({
    queryKey: ["user_workflow_trail", expandedUserId, selectedDate],
    queryFn: () => fetchUserWorkflowTrail(expandedUserId!, selectedDate),
    enabled: Boolean(expandedUserId) && !snapshot?.migrationPending,
    refetchInterval: isViewingToday && expandedUserId ? 20_000 : false,
  });

  const dailyByUser = useMemo(() => {
    const map = new Map<string, ActivityDailyRecord>();
    (snapshot?.selectedDayRows || []).forEach((row) => {
      map.set(row.user_id, row);
    });
    return map;
  }, [snapshot?.selectedDayRows]);

  const matrixByUserAndDate = useMemo(() => {
    const map = new Map<string, ActivityDailyRecord>();
    (snapshot?.rangeDaily || []).forEach((row) => {
      map.set(`${row.user_id}__${row.activity_date}`, row);
    });
    return map;
  }, [snapshot?.rangeDaily]);

  const enrichedUsers = useMemo(() => {
    const profiles = snapshot?.profiles || [];
    return profiles.map((u: any) => {
      const daily = dailyByUser.get(u.id) || null;
      const effectiveLastSeen = daily?.last_seen_at || u.last_seen_at || null;
      const online = isViewingToday && isUserOnlineNow(effectiveLastSeen, u.status);
      const accessedOnDate = Boolean(daily);
      const isInactiveAccount = u.status === "inativo";

      const presence: AvatarPresenceStatus = isInactiveAccount
        ? "inactive"
        : online
        ? "online"
        : accessedOnDate
        ? "today"
        : "offline";

      return {
        ...u,
        daily,
        online,
        accessedOnDate,
        isAbsentOnDate: !accessedOnDate && !isInactiveAccount,
        isInactiveAccount,
        presence,
        effectiveLastSeen,
        hierarchy: getHierarchyInfo(u),
      };
    });
  }, [snapshot?.profiles, dailyByUser, isViewingToday]);

  const kpis = useMemo(() => {
    const activeAccounts = enrichedUsers.filter((u: any) => !u.isInactiveAccount);
    const onlineCount = activeAccounts.filter((u: any) => u.online).length;
    const accessedCount = activeAccounts.filter((u: any) => u.accessedOnDate).length;
    const absentCount = activeAccounts.filter((u: any) => !u.accessedOnDate).length;
    const totalSeconds = activeAccounts.reduce(
      (acc: number, u: any) => acc + (u.daily?.active_seconds || 0),
      0
    );
    const avgSeconds = accessedCount > 0 ? Math.round(totalSeconds / accessedCount) : 0;

    return {
      totalActiveAccounts: activeAccounts.length,
      onlineCount,
      accessedCount,
      absentCount,
      avgSeconds,
      totalSeconds,
    };
  }, [enrichedUsers]);

  const filteredUsers = useMemo(() => {
    return enrichedUsers
      .filter((u: any) => {
        if (statusFilter === "online" && !u.online) return false;
        if (statusFilter === "acessaram" && !u.accessedOnDate) return false;
        if (statusFilter === "ausentes" && !u.isAbsentOnDate) return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            (u.full_name || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q) ||
            (u.position || "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a: any, b: any) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        if (a.accessedOnDate !== b.accessedOnDate) return a.accessedOnDate ? -1 : 1;
        return (b.daily?.active_seconds || 0) - (a.daily?.active_seconds || 0);
      });
  }, [enrichedUsers, statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DO MONITORAMENTO (PIXEL DE FLUXO) ── */}
      <div className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-base font-bold text-foreground">
                  Pixel de Presença & Fluxo de Trabalho
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Tempo Real
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acompanhe quem está online agora, quem logou no dia, quem não acessou a plataforma e a trilha exata de telas percorridas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Atalhos Rápidos de Data */}
            <button
              type="button"
              onClick={() => setSelectedDate(todayIso)}
              className={`rounded-xl px-3 py-2 text-[11px] font-bold border transition ${
                selectedDate === todayIso
                  ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayIso)}
              className={`rounded-xl px-3 py-2 text-[11px] font-bold border transition ${
                selectedDate === yesterdayIso
                  ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              Ontem
            </button>
            <div className="relative flex items-center">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
              <input
                type="date"
                max={todayIso}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="rounded-xl border border-white/10 bg-background/70 pl-8 pr-3 py-1.5 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-bold text-foreground transition disabled:opacity-50"
              title="Atualizar leitura do pixel agora"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* ── AVISO SE A MIGRATION DO PIXEL AINDA NÃO FOI EXECUTADA NO BANCO REMOTO ── */}
        {snapshot?.migrationPending && (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider text-[11px]">
                Ativação do Banco Pendente (SQL Migration)
              </p>
              <p className="text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                As tabelas <code className="px-1 py-0.5 rounded bg-muted dark:bg-black/40 font-mono">user_activity_daily</code> e{" "}
                <code className="px-1 py-0.5 rounded bg-muted dark:bg-black/40 font-mono">user_activity_events</code> ainda não foram criadas no Supabase remoto.
                Execute o arquivo{" "}
                <code className="px-1 py-0.5 rounded bg-muted dark:bg-black/40 font-mono">
                  supabase/migrations/20261112200000_rbac_didactic_roles_avatars_and_activity_pixel.sql
                </code>{" "}
                no SQL Editor do seu projeto Supabase para ativar a gravação completa dos logs diários e trilha do fluxo.
              </p>
            </div>
          </div>
        )}

        {/* ── KPIs DO DIA SELECIONADO ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border dark:border-white/5">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Online Agora</p>
              <p className="text-2xl font-black text-foreground mt-0.5">
                {isViewingToday ? kpis.onlineCount : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isViewingToday ? "Pulso ativo (< 2 min)" : "Disponível apenas para hoje"}
              </p>
            </div>
            <Wifi className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">Acessaram no Dia</p>
              <p className="text-2xl font-black text-foreground mt-0.5">
                {kpis.accessedCount}
                <span className="text-xs font-mono text-muted-foreground">/{kpis.totalActiveAccounts}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">Usuários ativos que logaram</p>
            </div>
            <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">Não Acessaram</p>
              <p className="text-2xl font-black text-foreground mt-0.5">{kpis.absentCount}</p>
              <p className="text-[10px] text-muted-foreground">Sem registro em {formatShortBrDate(selectedDate)}</p>
            </div>
            <UserX className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>

          <div className="rounded-2xl border border-purple-500/25 bg-purple-500/[0.06] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-300">Média / Tempo Ativo</p>
              <p className="text-2xl font-black text-foreground mt-0.5">{formatDurationCompact(kpis.avgSeconds)}</p>
              <p className="text-[10px] text-muted-foreground">
                Total equipe: {formatDurationCompact(kpis.totalSeconds)}
              </p>
            </div>
            <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* ── CONTROLES DE MODO (DIA vs MATRIZ HISTÓRICA) + FILTROS ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-border dark:border-white/10 bg-muted/40 dark:bg-black/30 p-1">
            <button
              type="button"
              onClick={() => setViewMode("diario")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === "diario" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" /> Fluxo do Dia ({formatShortBrDate(selectedDate)})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("matriz")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === "matriz" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" /> Histórico Multi-Dias
            </button>
          </div>

          {viewMode === "diario" ? (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {[
                { id: "todos" as const, label: "Todos", count: enrichedUsers.length },
                ...(isViewingToday
                  ? [{ id: "online" as const, label: "Online Agora", count: kpis.onlineCount }]
                  : []),
                { id: "acessaram" as const, label: "Acessaram", count: kpis.accessedCount },
                { id: "ausentes" as const, label: "Não Acessaram", count: kpis.absentCount },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition whitespace-nowrap ${
                    statusFilter === pill.id
                      ? "bg-muted dark:bg-white/15 text-foreground border border-border dark:border-white/20"
                      : "bg-muted/40 dark:bg-white/5 text-muted-foreground hover:bg-muted dark:hover:bg-white/10"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className="font-mono text-[10px] opacity-80">({pill.count})</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="inline-flex rounded-xl border border-border dark:border-white/10 bg-muted/40 dark:bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setMatrixDays(7)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  matrixDays === 7 ? "bg-card dark:bg-white/15 text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                7 dias
              </button>
              <button
                type="button"
                onClick={() => setMatrixDays(14)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  matrixDays === 14 ? "bg-card dark:bg-white/15 text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                14 dias
              </button>
            </div>
          )}
        </div>

        <div className="relative w-full md:w-64 shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar colaborador ou cargo..."
            className="w-full rounded-xl border border-white/10 bg-background/60 pl-8 pr-8 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── CONTEÚDO PRINCIPAL: FLUXO DIÁRIO OU MATRIZ HISTÓRICA ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : viewMode === "diario" ? (
        <div className="space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-xs text-muted-foreground">
              Nenhum colaborador encontrado neste filtro para {formatShortBrDate(selectedDate)}.
            </div>
          ) : (
            filteredUsers.map((u: any) => {
              const isExpanded = expandedUserId === u.id;
              const daily: ActivityDailyRecord | null = u.daily;
              const lastPingRelative = u.effectiveLastSeen
                ? formatDistanceToNow(new Date(u.effectiveLastSeen), { addSuffix: true, locale: ptBR })
                : "Sem registro";

              return (
                <div
                  key={u.id}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    u.online
                      ? "border-emerald-500/35 bg-emerald-500/[0.03]"
                      : u.accessedOnDate
                      ? "border-white/10 bg-background/60"
                      : "border-red-500/15 bg-red-500/[0.02]"
                  }`}
                >
                  <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Identificação com Foto Global */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <UserAvatar
                        src={u.avatar_url}
                        name={u.full_name}
                        email={u.email}
                        size="lg"
                        rounded="2xl"
                        onlineStatus={u.presence}
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-foreground truncate">
                            {u.full_name || "Sem Nome"}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                              u.online
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : u.accessedOnDate
                                ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                : u.isInactiveAccount
                                ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                                : "bg-red-500/15 text-red-400 border-red-500/30"
                            }`}
                          >
                            {u.online
                              ? "Online Agora"
                              : u.accessedOnDate
                              ? "Acessou no Dia"
                              : u.isInactiveAccount
                              ? "Conta Suspensa"
                              : "Não Acessou"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {u.position || u.hierarchy.title} · <span className="font-mono text-[11px]">{u.email}</span>
                        </p>
                      </div>
                    </div>

                    {/* Métricas do Pixel no Dia */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-5 text-xs shrink-0">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          1º Acesso
                        </p>
                        <p className="font-mono font-bold text-foreground mt-0.5">
                          {formatTimeOnly(daily?.first_seen_at)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Última Atividade
                        </p>
                        <p className="font-mono font-bold text-foreground mt-0.5" title={lastPingRelative}>
                          {daily ? formatTimeOnly(daily.last_seen_at) : "—"}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate max-w-[115px]">{lastPingRelative}</p>
                      </div>

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Tela Atual / Última
                        </p>
                        <p className="font-bold text-foreground truncate max-w-[140px] mt-0.5">
                          {daily?.last_page_label || u.last_page_label || "—"}
                        </p>
                        <p className="text-[9px] text-primary font-bold truncate">
                          {daily?.last_hub || (daily ? "Plataforma" : "Sem navegação")}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Tempo / Telas
                          </p>
                          <p className="font-mono font-black text-foreground mt-0.5">
                            {formatDurationCompact(daily?.active_seconds)}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {daily ? `${daily.page_views_count} acessos` : "0 acessos"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          disabled={!daily}
                          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                            isExpanded
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-white/5 border-white/10 text-foreground hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                          }`}
                          title="Ver trilha cronológica de páginas percorridas no dia"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Fluxo</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── TRILHA DE FLUXO DO USUÁRIO EXPANDIDA ── */}
                  {isExpanded && (
                    <div className="border-t border-border dark:border-white/10 bg-muted/30 dark:bg-black/35 p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5" />
                          Linha do Tempo do Fluxo de Trabalho ({formatShortBrDate(selectedDate)})
                        </span>
                        {daily?.device_info && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Dispositivo: {daily.device_info}
                          </span>
                        )}
                      </div>

                      {trailLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> Carregando trilha do pixel...
                        </div>
                      ) : expandedTrail.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          Nenhum evento detalhado gravado nesta data.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                          {expandedTrail.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border dark:border-white/5 bg-card/80 dark:bg-white/[0.02] px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="font-mono text-[11px] font-bold text-emerald-400 shrink-0">
                                  {formatTimeOnly(ev.entered_at)}
                                </span>
                                <span className="rounded bg-primary/15 border border-primary/25 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary shrink-0">
                                  {ev.hub_name}
                                </span>
                                <span className="font-bold text-foreground truncate">{ev.page_label}</span>
                                <span className="hidden sm:inline font-mono text-[10px] text-muted-foreground truncate">
                                  {ev.route}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-muted-foreground">
                                {ev.event_type === "login" && (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase">
                                    Login
                                  </span>
                                )}
                                <span>{formatDurationCompact(ev.duration_seconds)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ── MODO MATRIZ HISTÓRICA MULTI-DIAS ── */
        <div className="glass-panel p-4 sm:p-5 overflow-x-auto">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Clique em qualquer dia de um colaborador para abrir a trilha exata do fluxo de trabalho daquela data.
            </p>
            <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-500/70" /> Acessou
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-red-500/30 border border-red-500/40" /> Não acessou
              </span>
            </div>
          </div>

          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 pr-4">Colaborador</th>
                {(snapshot?.matrixDates || []).map((dt) => (
                  <th
                    key={dt}
                    className={`py-2.5 px-1.5 text-center font-mono ${
                      dt === selectedDate ? "text-primary" : ""
                    }`}
                  >
                    {formatShortBrDate(dt)}
                  </th>
                ))}
                <th className="py-2.5 pl-3 text-right">Presenças</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredUsers.map((u: any) => {
                const dates = snapshot?.matrixDates || [];
                const presentDays = dates.filter((dt) =>
                  matrixByUserAndDate.has(`${u.id}__${dt}`)
                ).length;

                return (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          src={u.avatar_url}
                          name={u.full_name}
                          email={u.email}
                          size="sm"
                          onlineStatus={u.presence}
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate max-w-[180px]">
                            {u.full_name || "Sem Nome"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                            {u.position || u.hierarchy.title}
                          </p>
                        </div>
                      </div>
                    </td>

                    {dates.map((dt) => {
                      const rec = matrixByUserAndDate.get(`${u.id}__${dt}`);
                      return (
                        <td key={dt} className="py-2 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(dt);
                              setViewMode("diario");
                              if (rec) setExpandedUserId(u.id);
                            }}
                            title={
                              rec
                                ? `${formatShortBrDate(dt)}: ${formatDurationCompact(rec.active_seconds)} ativos (${rec.page_views_count} acessos)`
                                : `${formatShortBrDate(dt)}: Sem acesso registrado`
                            }
                            className={`h-8 w-full min-w-[38px] rounded-lg border text-[10px] font-mono font-bold transition hover:scale-105 ${
                              rec
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                : "bg-red-500/10 border-red-500/20 text-red-400/60"
                            }`}
                          >
                            {rec ? formatDurationCompact(rec.active_seconds).replace(" ", "") : "—"}
                          </button>
                        </td>
                      );
                    })}

                    <td className="py-2.5 pl-3 text-right font-mono font-bold text-foreground">
                      {presentDays}/{dates.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

