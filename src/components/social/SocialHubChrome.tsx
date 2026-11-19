import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Instagram,
  Share2,
} from "lucide-react";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import { useSocialAccountsQuery } from "@/hooks/useSocialHubData";
import {
  classifySocialAccount,
  formatHumanSyncStatus,
  getActiveSocialNavGroup,
  requiresExplicitAccountForAction,
  SOCIAL_HUB_NAV_GROUPS,
  type AccountScopedAction,
} from "@/lib/socialStrategyDomain";
import type { SocialDataState } from "@/lib/metaSocialErrors";

export interface SocialHubChromeProps {
  tenantId?: string | null;
  showAccountSelector?: boolean;
  requireExplicitAccount?: AccountScopedAction | null;
  syncStatus?: {
    isLoading: boolean;
    isFetching: boolean;
    isFromFallback?: boolean;
    snapshotAt?: string | null;
    dataState: SocialDataState;
  };
  rightSlot?: React.ReactNode;
}

export function SocialHubChrome({
  tenantId,
  showAccountSelector = true,
  requireExplicitAccount = null,
  syncStatus,
  rightSlot,
}: SocialHubChromeProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeGroupId = getActiveSocialNavGroup(pathname);
  const activeGroup = SOCIAL_HUB_NAV_GROUPS.find((g) => g.id === activeGroupId);

  const { selectedPage, setSelectedPage } = useSocialHubFilters();
  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];

  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;
  const selectedClassification = selectedAccount
    ? classifySocialAccount(selectedAccount)
    : null;

  const explicitCheck = requireExplicitAccount
    ? requiresExplicitAccountForAction(selectedPage, requireExplicitAccount)
    : { allowed: true, reason: null };

  const humanSync = syncStatus ? formatHumanSyncStatus(syncStatus) : null;

  const toneBadgeClass: Record<NonNullable<typeof humanSync>["tone"], string> = {
    fresh: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    loading: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    error: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  const hasSubLinks = Boolean(activeGroup?.children && activeGroup.children.length > 0);
  const hasToolbarContent = hasSubLinks || showAccountSelector || Boolean(humanSync) || Boolean(rightSlot);

  return (
    <div className="space-y-3 mb-4 sm:mb-5">
      {/* Barra Contextual Social (Mobile-first: sub-páginas + seletor de conta fácil de tocar) */}
      {hasToolbarContent && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 rounded-2xl border border-border/80 bg-card/85 p-3 sm:px-3.5 sm:py-2.5 shadow-sm backdrop-blur-sm">
          {/* Sub-links quando o grupo ativo possui múltiplas páginas */}
          {hasSubLinks ? (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 lg:pb-0">
              {activeGroup!.children!.map((sub) => {
                const isSubActive =
                  sub.to === "/social"
                    ? pathname === "/social"
                    : pathname === sub.to || pathname.startsWith(`${sub.to}/`);
                return (
                  <Link
                    key={sub.to}
                    to={sub.to as any}
                    preload="intent"
                    title={sub.description}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 sm:py-1.5 text-xs sm:text-[11px] font-semibold transition-all min-h-[36px] sm:min-h-0 ${
                      isSubActive
                        ? "bg-primary/12 text-primary border border-primary/25 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
                    }`}
                  >
                    {sub.to === "/social" && <Calendar className="h-3.5 w-3.5" />}
                    <span>{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          {/* Seletor Compartilhado de Conta + Status Humano */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 lg:ml-auto w-full lg:w-auto">
            {showAccountSelector && (
              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                <div className="relative flex items-center flex-1 sm:flex-initial">
                  <Building2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-muted-foreground absolute left-3 sm:left-2.5 pointer-events-none" />
                  <select
                    data-testid="social-account-selector"
                    aria-label="Selecionar conta social"
                    value={selectedPage}
                    onChange={(e) => {
                      const val = e.target.value;
                      const acc = accounts.find((a) => a.page_id === val);
                      setSelectedPage(val, acc?.page_name || null);
                    }}
                    className="h-10 sm:h-8 w-full sm:w-auto rounded-xl border border-border bg-background pl-9 sm:pl-8 pr-7 text-sm sm:text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 sm:max-w-[260px]"
                  >
                    <option value="all">
                      Todas as Contas ({accounts.length})
                    </option>
                    {accounts.map((acc) => (
                      <option key={acc.page_id} value={acc.page_id}>
                        {acc.page_name}
                        {acc.instagram_account_id ? " (IG + FB)" : " (Somente FB)"}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedClassification && (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 sm:py-1 text-[11px] font-semibold ${
                      selectedClassification.hasInstagram
                        ? "border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-400"
                        : "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {selectedClassification.hasInstagram ? (
                      <>
                        <Instagram className="h-3 w-3" /> IG + FB
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3 w-3" /> FB
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {humanSync && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                    toneBadgeClass[humanSync.tone]
                  }`}
                >
                  {humanSync.label}
                </span>
              )}

              {rightSlot}
            </div>
          </div>
        </div>
      )}

      {/* Aviso explícito quando a ação/tela exige seleção de uma conta específica */}
      {!explicitCheck.allowed && explicitCheck.reason && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-bold">Selecione uma conta específica para continuar</p>
              <p className="text-[11px] opacity-90 mt-0.5">{explicitCheck.reason}</p>
            </div>
          </div>
          {accounts.length > 0 && (
            <select
              aria-label="Escolher conta específica"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const acc = accounts.find((a) => a.page_id === val);
                setSelectedPage(val, acc?.page_name || null);
              }}
              className="h-8 rounded-xl border border-amber-500/40 bg-background px-2.5 text-xs font-semibold text-foreground shrink-0"
            >
              <option value="">Escolher conta...</option>
              {accounts.map((acc) => (
                <option key={acc.page_id} value={acc.page_id}>
                  {acc.page_name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
