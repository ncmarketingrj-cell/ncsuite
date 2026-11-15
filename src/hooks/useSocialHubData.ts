import { useCallback, useMemo, useState } from "react";
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
  resolveSocialDataWithSWR,
  type SocialNetworkScope,
} from "@/lib/socialCacheDomain";

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
  const tenantId = params?.tenantId || "default";
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

  return useQuery({
    queryKey,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
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
  const tenantId = params.tenantId || "default";
  const network: SocialNetworkScope = params.network || "all";
  const chartDays = params.chartDaysOverride || 14;
  const faultVariant = params.simulatedFault || "none";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: params.selectedPage || "all",
      network,
      period: `${params.dateFrom}_${params.dateTo}_d${chartDays}`,
      dataClass: "insights" as const,
      variant: faultVariant,
    }),
    [tenantId, params.selectedPage, network, params.dateFrom, params.dateTo, chartDays, faultVariant]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "overview", cacheKey, params.accounts.length] as const,
    [cacheKey, params.accounts.length]
  );

  const initialEnvelope =
    faultVariant === "none" ? readSocialCacheEnvelope<CachedSocialOverview>(cacheKey) : null;

  return useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
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
            selectedPageId: params.selectedPage,
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
  const tenantId = params.tenantId || "default";
  const network: SocialNetworkScope = params.network || "all";
  const periodStr = params.onlyInPeriod
    ? `${params.dateFrom || ""}_${params.dateTo || ""}`
    : "recent";
  const faultVariant = params.simulatedFault || "none";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: params.selectedPage || "all",
      network,
      period: periodStr,
      dataClass: "posts" as const,
      variant: faultVariant,
    }),
    [tenantId, params.selectedPage, network, periodStr, faultVariant]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "posts", cacheKey, params.accounts.length] as const,
    [cacheKey, params.accounts.length]
  );

  const initialEnvelope =
    faultVariant === "none" ? readSocialCacheEnvelope<CachedSocialPosts>(cacheKey) : null;

  return useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
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
            selectedPageId: params.selectedPage,
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
  const tenantId = params.tenantId || "default";
  const network: SocialNetworkScope = params.network || "all";

  const keyParams = useMemo(
    () => ({
      tenantId,
      accountScope: params.selectedPage || "all",
      network,
      period: "planner",
      dataClass: "planner" as const,
      variant: Boolean(params.masterToken) ? "with_token" : "no_token",
    }),
    [tenantId, params.selectedPage, network, params.masterToken]
  );

  const cacheKey = useMemo(() => buildSocialCacheKey(keyParams), [keyParams]);
  const queryKey = useMemo(
    () => ["social-hub", "planner", cacheKey, params.accounts.length] as const,
    [cacheKey, params.accounts.length]
  );

  const initialEnvelope = readSocialCacheEnvelope<CachedSocialPlanner>(cacheKey);

  return useQuery({
    queryKey,
    enabled: params.enabled !== false,
    initialData: initialEnvelope?.data,
    initialDataUpdatedAt: initialEnvelope
      ? Date.parse(initialEnvelope.snapshotAt) || undefined
      : undefined,
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
            selectedPageId: params.selectedPage,
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
      const tenantId = input.tenantId || "default";
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

        if (input.includeInsights && input.dateFrom && input.dateTo) {
          const chartDays = input.chartDaysOverride || 14;
          const overviewParams = {
            tenantId,
            accountScope: input.selectedPage || "all",
            network,
            period: `${input.dateFrom}_${input.dateTo}_d${chartDays}`,
            dataClass: "insights" as const,
            variant: fault || "none",
          };
          const postsParams = {
            tenantId,
            accountScope: input.selectedPage || "all",
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
                  selectedPageId: input.selectedPage,
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
                  selectedPageId: input.selectedPage,
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
            ["social-hub", "overview", buildSocialCacheKey(overviewParams), accounts.length],
            ovRes.data
          );
          qc.setQueryData(
            ["social-hub", "posts", buildSocialCacheKey(postsParams), accounts.length],
            psRes.data
          );
        }

        if (input.includePlanner) {
          const plannerParams = {
            tenantId,
            accountScope: input.selectedPage || "all",
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
                selectedPageId: input.selectedPage,
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
            ["social-hub", "planner", buildSocialCacheKey(plannerParams), accounts.length],
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
