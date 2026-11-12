import React from "react";
import { Shield, Briefcase, Sparkles, Lock, Eye, Pencil, Info, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  CARGO_CATALOG,
  HUBS_CATALOG,
  PERMISSION_MODULES_CATALOG,
  getCargoDefinition,
  getRoleDefinition,
  hasPermissionAccess,
  type RoleDefinition,
} from "@/lib/userHierarchy";

interface DidacticUserAccessEditorProps {
  position: string;
  onPositionChange: (pos: string) => void;
  role: string;
  onRoleChange: (role: string) => void;
  permissions: Record<string, string>;
  onPermissionsChange: (perms: Record<string, string>) => void;
  allowedRoles: RoleDefinition[];
  allowedPositions: string[];
  autoApplyCargoDefaults?: boolean;
}

export function DidacticUserAccessEditor({
  position,
  onPositionChange,
  role,
  onRoleChange,
  permissions,
  onPermissionsChange,
  allowedRoles,
  allowedPositions,
  autoApplyCargoDefaults = true,
}: DidacticUserAccessEditorProps) {
  const roleDef = getRoleDefinition(role);
  const cargoDef = getCargoDefinition(position);

  const canManageTeam =
    role === "admin" ||
    role === "ceo" ||
    hasPermissionAccess(permissions, "criar_usuarios");

  const canAccessConfig =
    role === "admin" ||
    role === "ceo" ||
    role === "diretor" ||
    hasPermissionAccess(permissions, "criar_usuarios");

  const liberatedCount = PERMISSION_MODULES_CATALOG.filter((m) =>
    hasPermissionAccess(permissions, m.key)
  ).length;
  const blockedCount = PERMISSION_MODULES_CATALOG.length - liberatedCount;

  const handlePositionSelect = (nextPos: string) => {
    onPositionChange(nextPos);
    if (!autoApplyCargoDefaults) return;
    const found = getCargoDefinition(nextPos);
    if (found) {
      const canUseRecommendedRole = allowedRoles.some((r) => r.value === found.recommendedRole);
      if (canUseRecommendedRole) {
        onRoleChange(found.recommendedRole);
      }
      onPermissionsChange({
        ...found.defaultPermissions,
        ...(permissions._last_password ? { _last_password: permissions._last_password } : {}),
      });
    }
  };

  const applyRecommendedForPosition = () => {
    const found = getCargoDefinition(position);
    if (!found) return;
    const canUseRecommendedRole = allowedRoles.some((r) => r.value === found.recommendedRole);
    if (canUseRecommendedRole) {
      onRoleChange(found.recommendedRole);
    }
    onPermissionsChange({
      ...found.defaultPermissions,
      ...(permissions._last_password ? { _last_password: permissions._last_password } : {}),
    });
  };

  const handleAllowAll = () => {
    const next: Record<string, string> = {};
    PERMISSION_MODULES_CATALOG.forEach((m) => {
      next[m.key] = m.mode === "read_only" ? "view" : "edit";
    });
    if (permissions._last_password) next._last_password = permissions._last_password;
    onPermissionsChange(next);
  };

  const handleBlockAll = () => {
    const next: Record<string, string> = {};
    PERMISSION_MODULES_CATALOG.forEach((m) => {
      next[m.key] = "none";
    });
    if (permissions._last_password) next._last_password = permissions._last_password;
    onPermissionsChange(next);
  };

  const setModulePerm = (key: string, value: "none" | "view" | "edit") => {
    onPermissionsChange({
      ...permissions,
      [key]: value,
    });
  };

  return (
    <div className="space-y-5">
      {/* ── PASSO 1 & 2: CARGO vs PATENTE HIERÁRQUICA (EXPLICAÇÃO DIDÁTICA) ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <div>
              <h5 className="text-xs font-black uppercase tracking-wider text-foreground">
                1. Cargo na Agência vs. Patente no Sistema
              </h5>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <strong>Cargo</strong> identifica o que a pessoa faz na agência. <strong>Patente</strong> define a hierarquia (quem pode editar quem). O que ela enxerga no menu é controlado pelas <strong>Permissões por Hub</strong> logo abaixo.
              </p>
            </div>
          </div>

          {cargoDef && (
            <button
              type="button"
              onClick={applyRecommendedForPosition}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 transition shrink-0"
            >
              <Sparkles className="h-3 w-3" /> Aplicar Padrão de {position}
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* CAMPO 1: CARGO NA AGÊNCIA */}
          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-primary" />
              <span>Cargo / Função (Rótulo Profissional)</span>
            </label>
            <select
              value={position}
              onChange={(e) => handlePositionSelect(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-background px-3.5 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none cursor-pointer"
            >
              {!allowedPositions.includes(position) && position && (
                <option value={position}>{position}</option>
              )}
              {allowedPositions.map((pos) => (
                <option key={pos} value={pos} className="bg-card text-foreground">
                  {pos}
                </option>
              ))}
            </select>
            {cargoDef && (
              <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
                {cargoDef.summary}
              </p>
            )}
          </div>

          {/* CAMPO 2: PATENTE DE AUTORIDADE */}
          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-amber-400" />
              <span>Patente de Hierarquia (Autoridade)</span>
            </label>
            <select
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value;
                onRoleChange(nextRole);
                // Se desceu para nível <= 60 ou não é admin/diretor, garante segurança caso gestão estivesse aberta sem querer?
                // Melhor não apagar customizações manuais sem avisar, mas se mudou para admin/ceo avisa que tem gestão total.
              }}
              className="w-full rounded-xl border border-white/10 bg-background px-3.5 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none cursor-pointer"
            >
              {!allowedRoles.some((r) => r.value === role) && role && (
                <option value={role}>{roleDef.label}</option>
              )}
              {allowedRoles.map((r) => (
                <option key={r.value} value={r.value} className="bg-card text-foreground">
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-amber-300/90 leading-relaxed px-1">
              {roleDef.authoritySummary}
            </p>
          </div>
        </div>

        {/* ── RESUMO EM TEMPO REAL DO PODER EFETIVO DESTA CONTA ── */}
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-foreground">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span>Resumo Real do que este usuário consegue fazer agora:</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div
              className={`rounded-lg border px-2.5 py-2 flex items-center gap-2 ${
                canManageTeam
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground"
              }`}
            >
              {canManageTeam ? (
                <Users className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-bold text-[10px] uppercase tracking-wider">Gestão de Usuários</p>
                <p className="text-[10px] truncate">
                  {canManageTeam
                    ? `Liberada (abaixo do Nível ${roleDef.minLevel})`
                    : "Bloqueada (Não vê outros usuários)"}
                </p>
              </div>
            </div>

            <div
              className={`rounded-lg border px-2.5 py-2 flex items-center gap-2 ${
                canAccessConfig
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground"
              }`}
            >
              {canAccessConfig ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-bold text-[10px] uppercase tracking-wider">Configurações Gerais</p>
                <p className="text-[10px] truncate">
                  {canAccessConfig ? "Acessa aba de Configurações" : "Bloqueado (Somente Meu Perfil)"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 flex items-center gap-2 text-blue-300">
              <Eye className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-[10px] uppercase tracking-wider">Telas & Hubs</p>
                <p className="text-[10px] truncate">
                  {liberatedCount} liberados · {blockedCount} bloqueados
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PASSO 3: PERMISSÕES DIDÁTICAS POR HUB ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h5 className="text-xs font-black uppercase tracking-wider text-foreground">
              2. Permissões de Acesso por Módulo ({PERMISSION_MODULES_CATALOG.length})
            </h5>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Defina exatamente o que aparece no menu e o que o usuário pode editar: <strong>Bloqueado</strong> (invisível), <strong>Visualizar</strong> (só leitura) ou <strong>Editar</strong> (completo).
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            {cargoDef && (
              <button
                type="button"
                onClick={applyRecommendedForPosition}
                className="text-primary hover:underline"
              >
                Padrão de {position}
              </button>
            )}
            <span className="text-white/20">|</span>
            <button type="button" onClick={handleAllowAll} className="text-emerald-400 hover:underline">
              Liberar Tudo
            </button>
            <span className="text-white/20">|</span>
            <button type="button" onClick={handleBlockAll} className="text-muted-foreground hover:text-foreground">
              Bloquear Tudo
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {HUBS_CATALOG.map((hub) => {
            const modules = PERMISSION_MODULES_CATALOG.filter((m) => m.hub === hub.id);
            return (
              <div key={hub.id} className="rounded-2xl border border-white/10 bg-black/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${hub.badgeClass}`}>
                    {hub.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {modules.filter((m) => hasPermissionAccess(permissions, m.key)).length}/{modules.length} ativos
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((mod) => {
                    const rawVal: unknown = permissions?.[mod.key];
                    const normalized: "none" | "view" | "edit" =
                      rawVal === "edit" || rawVal === true
                        ? mod.mode === "read_only"
                          ? "view"
                          : "edit"
                        : rawVal === "view"
                        ? "view"
                        : "none";

                    const isBlocked = normalized === "none";
                    const isView = normalized === "view";

                    return (
                      <div
                        key={mod.key}
                        className={`rounded-xl border p-2.5 flex flex-col justify-between gap-2 transition ${
                          isBlocked
                            ? "border-white/5 bg-background/30 opacity-75"
                            : isView
                            ? "border-blue-500/25 bg-blue-500/[0.04]"
                            : "border-emerald-500/25 bg-emerald-500/[0.04]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-foreground truncate" title={mod.hint}>
                              {mod.label}
                            </p>
                            <p className="text-[9px] text-muted-foreground truncate">{mod.hint}</p>
                          </div>
                          {mod.mode === "read_only" && (
                            <span className="shrink-0 rounded bg-white/10 px-1 py-0.5 text-[8px] font-mono text-muted-foreground uppercase">
                              Analítico
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5">
                          <button
                            type="button"
                            onClick={() => setModulePerm(mod.key, "none")}
                            className={`flex items-center justify-center gap-1 rounded-md py-1 text-[9px] font-black uppercase transition ${
                              isBlocked
                                ? "bg-zinc-700/80 text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title="Bloqueado: o usuário não verá nem acessará este módulo"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            <span>Bloq.</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setModulePerm(mod.key, "view")}
                            className={`flex items-center justify-center gap-1 rounded-md py-1 text-[9px] font-black uppercase transition ${
                              isView
                                ? "bg-blue-600/80 text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title="Somente Visualizar: vê os dados sem alterar"
                          >
                            <Eye className="h-2.5 w-2.5" />
                            <span>Ver</span>
                          </button>

                          {mod.mode === "read_only" ? (
                            <div
                              className="flex items-center justify-center text-[8px] font-mono text-muted-foreground/40 select-none"
                              title="Módulo apenas analítico (sem edição)"
                            >
                              —
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setModulePerm(mod.key, "edit")}
                              className={`flex items-center justify-center gap-1 rounded-md py-1 text-[9px] font-black uppercase transition ${
                                normalized === "edit"
                                  ? "bg-emerald-600/80 text-white shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              title="Visualizar e Editar: controle completo"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                              <span>Editar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

