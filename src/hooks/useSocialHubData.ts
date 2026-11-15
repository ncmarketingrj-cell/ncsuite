import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAccountSocialOverview,
  fetchAccountSocialPosts,
  fetchLiveSocialAccounts,
  fetchRealPlannerPosts,
  type PlannerSyncResult,
  type RealSocialAccount,
  type SimulatedSocialFault,
  type SocialOverviewResult,
  type SocialPostsResult,
} from "@/lib/metaSocialService";
import {
  buildSocialCacheKey,
  getSocialCacheTtlMs,
  readSocialCacheEnvelope,
  recordSocialCacheHitEvent,
  resolveSocialDataWithSWR,
  type SocialDataClass,
  type SocialNetworkScope,
} from "@/lib/socialCacheDomain";
import { canonicalizeSocialPageId, getLastKnownTenantId } from "@/lib/socialHubStore";

function useTrackReactQueryCacheHit(input: {
  enabled: boolean;
  isFetching: boolean;
  hasData: boolean;
  dataUpdatedAt: number;
  dataClass: SocialDataClass;
  accountScope: string;
  network?: SocialNetworkScope;
  period?: string;
  cacheKey: string;
}) {
  const lastTrackedRef = useRef<string>("");
  useEffect(() => {
    if (!input.enabled || input.isFetching || !input.hasData) return;
    const stamp = `${input.cacheKey}::${input.dataUpdatedAt}`;
    if (lastTrackedRef.current === stamp) return;
    lastTrackedRef.current = stamp;
    recordSocialCacheHitEvent({
      dataClass: input.dataClass,
      accountScope: input.accountScope,
      network: input.network || "all",
      period: input.period || "default",
      reason: "react_query_cache_hit",
    });
  }, [
    input.enabled,
    input.isFetching,
    input.hasData,
    input.dataUpdatedAt,
    input.dataClass,
    input.accountScope,
    input.network,
    input.period,
    input.cacheKey,
  ]);
}

export type SocialAccountsResult = Awaited<ReturnType<typeof fetchLiveSocialAccounts>>;

export type CachedSocialOverview = SocialOverviewResult & {
  isFromFallback?: boolean;
  fromCache?: boolean;
  fallbackSnapshotAt?: string | null;
  revalidatingInBackground?: boolean;
};

export type CachedSocialPosts = SocialPostsResult & {
  isFromFallback?: boolean;
  fromCache?: boolean;
  fallbackSnapshotAt?: string | null;
  revalidatingInBackground?: boolean;
};

export type CachedSocialPlanner = PlannerSyncResult & {
  isFromFallback?: boolean;
  fromCache?: boolean;
  fallbackSnapshotAt?: string | null;
  revalidatingInBackground?: boolean;
  snapshotAt?: string;
};

export function useSocialAccountsQuery(params?: {
  tenantId?: string | null;
  simulatedFault?: SimulatedSocialFault;
}) {
  const qc = useQueryClient();
  const tenantId = getLastKnownTenantId(params?.tenantId);
  const faultVariant = params?.simulatedFault === "token_expired" ? "sim_token_expired" : "live";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: "all",
      network: "all" as SocialNetworkScope,
      period: "accounts",
      dataClass: "accounts" as const,
      variant: faultVariant,
    }),
    [tenantId, faultVariant]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(() => ["social-hub", "accounts", cacheKey] as const, [cacheKey]);

  const initialEnvelope =
    faultVariant === "live" ? readSocialCacheEnvelope<SocialAccountsResult>(cacheKey) : null;

  const query = useQuery({
    queryKey,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
    placeholderData: (prev) => prev,
    staleTime: getSocialCacheTtlMs("accounts"),
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<SocialAccountsResult> => {
      const resolved = await resolveSocialDataWithSWR<SocialAccountsResult>({
        keyParams,
        fetcher: async () => {
          const data = await fetchLiveSocialAccounts(false, {
            simulatedFault: params?.simulatedFault,
          });
          return {
            data,
            isValidForCache: data.accounts.length > 0 && !data.error,
            errorMessage: data.error || null,
            snapshotAt: data.telemetry?.snapshotAt || undefined,
          };
        },
        onBackgroundRevalidated: (fresh) => {
          qc.setQueryData(queryKey, fresh.data);
        },
        onErrorPreserve: (prev, errorMessage) => ({
          ...prev,
          error: errorMessage,
        }),
      });
      return resolved.data;
    },
  });

  useTrackReactQueryCacheHit({
    enabled: faultVariant === "live",
    isFetching: query.isFetching,
    hasData: Boolean(query.data && query.data.accounts.length > 0),
    dataUpdatedAt: query.dataUpdatedAt,
    dataClass: "accounts",
    accountScope: "all",
    period: "accounts",
    cacheKey,
  });

  return query;
}

export function useSocialOverviewQuery(params: {
  tenantId?: string | null;
  accounts: RealSocialAccount[];
  selectedPage: string;
  network?: SocialNetworkScope;
  masterToken: string | null;
  dateFrom: string;
  dateTo: string;
  chartDaysOverride?: number;
  simulatedFault?: SimulatedSocialFault;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const tenantId = getLastKnownTenantId(params.tenantId);
  const canonicalPage = useMemo(
    () => canonicalizeSocialPageId(params.selectedPage, params.accounts),
    [params.selectedPage, params.accounts]
  );
  const network: SocialNetworkScope = params.network || "all";
  const chartDays = params.chartDaysOverride || 14;
  const faultVariant = params.simulatedFault || "none";
  const accountsState = params.accounts.length > 0 ? "ready" : "empty";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: canonicalPage || "all",
      network,
      period: `${params.dateFrom}_${params.dateTo}_d${chartDays}`,
      dataClass: "insights" as const,
      variant: faultVariant,
    }),
    [tenantId, canonicalPage, network, params.dateFrom, params.dateTo, chartDays, faultVariant]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "overview", cacheKey, accountsState] as const,
    [cacheKey, accountsState]
  );

  const initialEnvelope =
    faultVariant === "none" ? readSocialCacheEnvelope<CachedSocialOverview>(cacheKey) : null;

  const query = useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
    placeholderData: (prev) => prev,
    staleTime: getSocialCacheTtlMs("insights"),
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<CachedSocialOverview> => {
      const resolved = await resolveSocialDataWithSWR<CachedSocialOverview>({
        keyParams,
        fetcher: async () => {
          // Não repassamos AbortSignal da rota: troca de tela não cancela sync compartilhado
          const result = await fetchAccountSocialOverview({
            accounts: params.accounts,
            selectedPageId: canonicalPage,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            chartDaysOverride: chartDays,
            masterToken: params.masterToken,
            simulatedFault: params.simulatedFault,
          });
          const isValid =
            result.syncSource === "meta_graph_v21" &&
            result.sectionStates.accountInsights.state !== "error";
          return {
            data: result,
            isValidForCache: isValid,
            errorMessage: result.errorMessage || null,
            snapshotAt: result.snapshotAt,
          };
        },
        onBackgroundRevalidated: (fresh) => {
          qc.setQueryData(queryKey, {
            ...fresh.data,
            fromCache: false,
            revalidatingInBackground: false,
          });
        },
        onErrorPreserve: (prev, errorMessage) => ({
          ...prev,
          isFromFallback: true,
          fromCache: true,
          fallbackSnapshotAt: prev.snapshotAt || null,
          errorMessage,
        }),
      });

      return {
        ...resolved.data,
        fromCache: resolved.source !== "meta_live",
        isFromFallback: resolved.source === "fallback_last_valid" || resolved.data.isFromFallback,
        fallbackSnapshotAt:
          resolved.source === "fallback_last_valid"
            ? resolved.snapshotAt
            : resolved.data.fallbackSnapshotAt || null,
        revalidatingInBackground: resolved.revalidatingInBackground,
      };
    },
  });

  useTrackReactQueryCacheHit({
    enabled: params.enabled !== false && faultVariant === "none",
    isFetching: query.isFetching,
    hasData: Boolean(query.data),
    dataUpdatedAt: query.dataUpdatedAt,
    dataClass: "insights",
    accountScope: canonicalPage,
    network,
    period: keyParams.period,
    cacheKey,
  });

  return query;
}

export function useSocialPostsQuery(params: {
  tenantId?: string | null;
  accounts: RealSocialAccount[];
  selectedPage: string;
  network?: SocialNetworkScope;
  masterToken: string | null;
  dateFrom?: string;
  dateTo?: string;
  onlyInPeriod?: boolean;
  simulatedFault?: SimulatedSocialFault;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const tenantId = getLastKnownTenantId(params.tenantId);
  const canonicalPage = useMemo(
    () => canonicalizeSocialPageId(params.selectedPage, params.accounts),
    [params.selectedPage, params.accounts]
  );
  const network: SocialNetworkScope = params.network || "all";
  const periodStr = params.onlyInPeriod
    ? `${params.dateFrom || ""}_${params.dateTo || ""}`
    : "recent";
  const faultVariant = params.simulatedFault || "none";
  const accountsState = params.accounts.length > 0 ? "ready" : "empty";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: canonicalPage || "all",
      network,
      period: periodStr,
      dataClass: "posts" as const,
      variant: faultVariant,
    }),
    [tenantId, canonicalPage, network, periodStr, faultVariant]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "posts", cacheKey, accountsState] as const,
    [cacheKey, accountsState]
  );

  const initialEnvelope =
    faultVariant === "none" ? readSocialCacheEnvelope<CachedSocialPosts>(cacheKey) : null;

  const query = useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
    placeholderData: (prev) => prev,
    staleTime: getSocialCacheTtlMs("posts"),
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<CachedSocialPosts> => {
      const resolved = await resolveSocialDataWithSWR<CachedSocialPosts>({
        keyParams,
        fetcher: async () => {
          const result = await fetchAccountSocialPosts({
            accounts: params.accounts,
            selectedPageId: canonicalPage,
            masterToken: params.masterToken,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            onlyInPeriod: params.onlyInPeriod,
            simulatedFault: params.simulatedFault,
          });
          const isValid =
            result.postsState.state === "success" ||
            result.postsState.state === "partial" ||
            result.postsState.state === "empty";
          return {
            data: result,
            isValidForCache: isValid,
            errorMessage: result.postsState.message || null,
            snapshotAt: result.snapshotAt,
          };
        },
        onBackgroundRevalidated: (fresh) => {
          qc.setQueryData(queryKey, {
            ...fresh.data,
            fromCache: false,
            revalidatingInBackground: false,
          });
        },
        onErrorPreserve: (prev, errorMessage) => ({
          ...prev,
          isFromFallback: true,
          fromCache: true,
          fallbackSnapshotAt: prev.snapshotAt || null,
          postsState: {
            ...prev.postsState,
            message: errorMessage,
          },
        }),
      });

      return {
        ...resolved.data,
        fromCache: resolved.source !== "meta_live",
        isFromFallback: resolved.source === "fallback_last_valid" || resolved.data.isFromFallback,
        fallbackSnapshotAt:
          resolved.source === "fallback_last_valid"
            ? resolved.snapshotAt
            : resolved.data.fallbackSnapshotAt || null,
        revalidatingInBackground: resolved.revalidatingInBackground,
      };
    },
  });

  useTrackReactQueryCacheHit({
    enabled: params.enabled !== false && faultVariant === "none",
    isFetching: query.isFetching,
    hasData: Boolean(query.data),
    dataUpdatedAt: query.dataUpdatedAt,
    dataClass: "posts",
    accountScope: canonicalPage,
    network,
    period: periodStr,
    cacheKey,
  });

  return query;
}

export function useSocialPlannerQuery(params: {
  tenantId?: string | null;
  accounts: RealSocialAccount[];
  selectedPage: string;
  network?: SocialNetworkScope;
  masterToken: string | null;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const tenantId = getLastKnownTenantId(params.tenantId);
  const canonicalPage = useMemo(
    () => canonicalizeSocialPageId(params.selectedPage, params.accounts),
    [params.selectedPage, params.accounts]
  );
  const network: SocialNetworkScope = params.network || "all";
  const accountsState = params.accounts.length > 0 ? "ready" : "empty";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: canonicalPage || "all",
      network,
      period: "planner",
      dataClass: "planner" as const,
      variant: Boolean(params.masterToken) ? "with_token" : "no_token",
    }),
    [tenantId, canonicalPage, network, params.masterToken]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "planner", cacheKey, accountsState] as const,
    [cacheKey, accountsState]
  );

  const initialEnvelope = readSocialCacheEnvelope<CachedSocialPlanner>(cacheKey);

  const query = useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
    placeholderData: (prev) => prev,
    staleTime: getSocialCacheTtlMs("planner"),
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<CachedSocialPlanner> => {
      const resolved = await resolveSocialDataWithSWR<CachedSocialPlanner>({
        keyParams,
        fetcher: async () => {
          const result = await fetchRealPlannerPosts({
            accounts: params.accounts,
            selectedPageId: canonicalPage,
            masterToken: params.masterToken,
          });
          const nowIso = new Date().toISOString();
          return {
            data: { ...result, snapshotAt: nowIso },
            isValidForCache: !result.errorMessage || result.posts.length > 0,
            errorMessage: result.errorMessage || null,
            snapshotAt: nowIso,
          };
        },
        onBackgroundRevalidated: (fresh) => {
          qc.setQueryData(queryKey, {
            ...fresh.data,
            fromCache: false,
            revalidatingInBackground: false,
          });
        },
        onErrorPreserve: (prev, errorMessage) => ({
          ...prev,
          isFromFallback: true,
          fromCache: true,
          fallbackSnapshotAt: prev.snapshotAt || null,
          errorMessage,
        }),
      });

      return {
        ...resolved.data,
        fromCache: resolved.source !== "meta_live",
        isFromFallback: resolved.source === "fallback_last_valid" || resolved.data.isFromFallback,
        fallbackSnapshotAt:
          resolved.source === "fallback_last_valid"
            ? resolved.snapshotAt
            : resolved.data.fallbackSnapshotAt || null,
        revalidatingInBackground: resolved.revalidatingInBackground,
      };
    },
  });

  useTrackReactQueryCacheHit({
    enabled: params.enabled !== false,
    isFetching: query.isFetching,
    hasData: Boolean(query.data),
    dataUpdatedAt: query.dataUpdatedAt,
    dataClass: "planner",
    accountScope: canonicalPage,
    network,
    period: "planner",
    cacheKey,
  });

  return query;
}

export function useManualSocialSync() {
  const qc = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncScope = useCallback(
    async (input: {
      tenantId?: string | null;
      selectedPage: string;
      network?: SocialNetworkScope;
      dateFrom?: string;
      dateTo?: string;
      chartDaysOverride?: number;
      onlyInPeriod?: boolean;
      simulatedFault?: SimulatedSocialFault;
      includePlanner?: boolean;
      includeInsights?: boolean;
    }) => {
      const tenantId = getLastKnownTenantId(input.tenantId);
      const network: SocialNetworkScope = input.network || "all";
      const fault = input.simulatedFault;
      setIsSyncing(true);

      try {
        const accountsKeyParams = {
          tenantId,
          accountScope: "all",
          network: "all" as SocialNetworkScope,
          period: "accounts",
          dataClass: "accounts" as const,
          variant: fault === "token_expired" ? "sim_token_expired" : "live",
        };
        const accRes = await resolveSocialDataWithSWR<SocialAccountsResult>({
          keyParams: accountsKeyParams,
          forceRefresh: true,
          fetcher: async () => {
            const data = await fetchLiveSocialAccounts(true, { simulatedFault: fault });
            return {
              data,
              isValidForCache: data.accounts.length > 0 && !data.error,
              errorMessage: data.error || null,
              snapshotAt: data.telemetry?.snapshotAt || undefined,
            };
          },
          onErrorPreserve: (prev, errMsg) => ({ ...prev, error: errMsg }),
        });

        const accCacheKey = buildSocialCacheKey(accountsKeyParams);
        qc.setQueryData(["social-hub", "accounts", accCacheKey], accRes.data);

        const accounts = accRes.data.accounts || [];
        const masterToken = accRes.data.masterToken || null;
        const accountsState = accounts.length > 0 ? "ready" : "empty";
        const canonicalPage = canonicalizeSocialPageId(input.selectedPage, accounts);

        if (input.includeInsights && input.dateFrom && input.dateTo) {
          const chartDays = input.chartDaysOverride || 14;
          const overviewParams = {
            tenantId,
            accountScope: canonicalPage || "all",
            network,
            period: `${input.dateFrom}_${input.dateTo}_d${chartDays}`,
            dataClass: "insights" as const,
            variant: fault || "none",
          };
          const postsParams = {
            tenantId,
            accountScope: canonicalPage || "all",
            network,
            period: input.onlyInPeriod ? `${input.dateFrom}_${input.dateTo}` : "recent",
            dataClass: "posts" as const,
            variant: fault || "none",
          };

          const [ovRes, psRes] = await Promise.all([
            resolveSocialDataWithSWR<CachedSocialOverview>({
              keyParams: overviewParams,
              forceRefresh: true,
              fetcher: async () => {
                const res = await fetchAccountSocialOverview({
                  accounts,
                  selectedPageId: canonicalPage,
                  dateFrom: input.dateFrom!,
                  dateTo: input.dateTo!,
                  chartDaysOverride: chartDays,
                  masterToken,
                  simulatedFault: fault,
                });
                return {
                  data: res,
                  isValidForCache:
                    res.syncSource === "meta_graph_v21" &&
                    res.sectionStates.accountInsights.state !== "error",
                  errorMessage: res.errorMessage || null,
                  snapshotAt: res.snapshotAt,
                };
              },
              onErrorPreserve: (prev, errorMessage) => ({
                ...prev,
                isFromFallback: true,
                fromCache: true,
                fallbackSnapshotAt: prev.snapshotAt || null,
                errorMessage,
              }),
            }),
            resolveSocialDataWithSWR<CachedSocialPosts>({
              keyParams: postsParams,
              forceRefresh: true,
              fetcher: async () => {
                const res = await fetchAccountSocialPosts({
                  accounts,
                  selectedPageId: canonicalPage,
                  masterToken,
                  dateFrom: input.dateFrom,
                  dateTo: input.dateTo,
                  onlyInPeriod: input.onlyInPeriod,
                  simulatedFault: fault,
                });
                return {
                  data: res,
                  isValidForCache:
                    res.postsState.state === "success" ||
                    res.postsState.state === "partial" ||
                    res.postsState.state === "empty",
                  errorMessage: res.postsState.message || null,
                  snapshotAt: res.snapshotAt,
                };
              },
              onErrorPreserve: (prev, errorMessage) => ({
                ...prev,
                isFromFallback: true,
                fromCache: true,
                fallbackSnapshotAt: prev.snapshotAt || null,
                postsState: { ...prev.postsState, message: errorMessage },
              }),
            }),
          ]);

          qc.setQueryData(
            ["social-hub", "overview", buildSocialCacheKey(overviewParams), accountsState],
            ovRes.data
          );
          qc.setQueryData(
            ["social-hub", "posts", buildSocialCacheKey(postsParams), accountsState],
            psRes.data
          );
        }

        if (input.includePlanner) {
          const plannerParams = {
            tenantId,
            accountScope: canonicalPage || "all",
            network,
            period: "planner",
            dataClass: "planner" as const,
            variant: Boolean(masterToken) ? "with_token" : "no_token",
          };
          const plRes = await resolveSocialDataWithSWR<CachedSocialPlanner>({
            keyParams: plannerParams,
            forceRefresh: true,
            fetcher: async () => {
              const res = await fetchRealPlannerPosts({
                accounts,
                selectedPageId: canonicalPage,
                masterToken,
              });
              const nowIso = new Date().toISOString();
              return {
                data: { ...res, snapshotAt: nowIso },
                isValidForCache: !res.errorMessage || res.posts.length > 0,
                errorMessage: res.errorMessage || null,
                snapshotAt: nowIso,
              };
            },
            onErrorPreserve: (prev, errorMessage) => ({
              ...prev,
              isFromFallback: true,
              fromCache: true,
              fallbackSnapshotAt: prev.snapshotAt || null,
              errorMessage,
            }),
          });
          qc.setQueryData(
            ["social-hub", "planner", buildSocialCacheKey(plannerParams), accountsState],
            plRes.data
          );
        }

        return accRes.data;
      } finally {
        setIsSyncing(false);
      }
    },
    [qc]
  );

  return { isSyncing, syncScope };
}
