import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAccountSocialOverview,
  fetchAccountSocialPosts,
  fetchLiveSocialAccounts,
  fetchNextPlannerPostsPage,
  fetchPlannerMediaInsightsBatch,
  fetchRealPlannerPosts,
  type PlannerSyncResult,
  type RealSocialAccount,
  type SimulatedSocialFault,
  type SocialOverviewResult,
  type SocialPostsResult,
} from "@/lib/metaSocialService";
import {
  buildSocialCacheKey,
  ensureSocialPerfInitialized,
  getSocialCacheTtlMs,
  readSocialCacheEnvelope,
  recordSocialCacheHitEvent,
  resolveSocialDataWithSWR,
  runSharedSocialSync,
  writeSocialCacheEnvelope,
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
    ensureSocialPerfInitialized();
  }, []);

  useEffect(() => {
    ensureSocialPerfInitialized();
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
  const selectedRangeDays = useMemo(() => {
    const startMs = Date.parse(`${params.dateFrom}T00:00:00Z`);
    const endMs = Date.parse(`${params.dateTo}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 7;
    return Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
  }, [params.dateFrom, params.dateTo]);
  const chartDays =
    typeof params.chartDaysOverride === "number" && params.chartDaysOverride > 0
      ? params.chartDaysOverride
      : selectedRangeDays;
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
            tenantId,
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

export function usePlannerProgressiveInsights(params: {
  tenantId?: string | null;
  accounts: RealSocialAccount[];
  selectedPage: string;
  network?: SocialNetworkScope;
  masterToken: string | null;
  plannerData?: CachedSocialPlanner;
  targetMediaIds: string[];
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
  const [isEnrichingInsights, setIsEnrichingInsights] = useState(false);

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

  const pendingMediaIds = useMemo(() => {
    if (!params.enabled || !params.masterToken || !params.plannerData?.posts?.length) {
      return [];
    }
    const targetSet = new Set(params.targetMediaIds.filter(Boolean));
    if (targetSet.size === 0) return [];
    const pending = new Set<string>();
    for (const p of params.plannerData.posts) {
      if (
        p.platform === "instagram" &&
        p.status === "published" &&
        p.meta_post_id &&
        targetSet.has(p.meta_post_id) &&
        p.insightsStatus === "pending"
      ) {
        pending.add(p.meta_post_id);
      }
    }
    return Array.from(pending);
  }, [params.enabled, params.masterToken, params.plannerData?.posts, params.targetMediaIds]);

  const pendingKey = pendingMediaIds.join(",");

  useEffect(() => {
    if (!pendingKey || !params.masterToken) {
      setIsEnrichingInsights(false);
      return;
    }
    let mounted = true;
    setIsEnrichingInsights(true);

    void fetchPlannerMediaInsightsBatch({
      mediaIds: pendingMediaIds,
      masterToken: params.masterToken,
      tenantId,
      accountScope: canonicalPage || "all",
      concurrency: 3,
    })
      .then((metricsById) => {
        if (Object.keys(metricsById).length === 0) return;
        const applyPatch = (prev: CachedSocialPlanner | undefined): CachedSocialPlanner | undefined => {
          if (!prev) return prev;
          let changed = false;
          const nextPosts = prev.posts.map((post) => {
            if (!post.meta_post_id || !metricsById[post.meta_post_id]) return post;
            const m = metricsById[post.meta_post_id];
            changed = true;
            return {
              ...post,
              reach_count: m.reach,
              impressions_count: m.views,
              saves_count: m.saved,
              shares_count: m.shares,
              insightsStatus: (m.available ? "loaded" : "unavailable") as "loaded" | "unavailable",
            };
          });
          if (!changed) return prev;
          const updated: CachedSocialPlanner = { ...prev, posts: nextPosts };
          writeSocialCacheEnvelope(
            cacheKey,
            {
              ...keyParams,
              snapshotAt: updated.snapshotAt || new Date().toISOString(),
            },
            updated
          );
          return updated;
        };
        qc.setQueryData<CachedSocialPlanner | undefined>(queryKey, applyPatch);
      })
      .finally(() => {
        if (mounted) setIsEnrichingInsights(false);
      });

    return () => {
      mounted = false;
    };
  }, [pendingKey, params.masterToken, tenantId, canonicalPage, cacheKey, keyParams, qc, queryKey]);

  return { isEnrichingInsights };
}

export function usePlannerPagination(params: {
  tenantId?: string | null;
  accounts: RealSocialAccount[];
  selectedPage: string;
  network?: SocialNetworkScope;
  masterToken: string | null;
  plannerData?: CachedSocialPlanner;
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
  const [isLoadingMorePages, setIsLoadingMorePages] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const autoStage3TriggeredRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const pagination = params.plannerData?.pagination;
  const hasMorePages = Boolean(pagination?.hasMore);
  const igTotalMediaCount =
    pagination?.igTotalMediaCount ?? params.plannerData?.igProfile?.media_count ?? null;
  const isPartialSample = Boolean(pagination?.isPartialSample || hasMorePages);

  const loadMorePages = useCallback(
    async (pagesToFetch = 1) => {
      const current =
        qc.getQueryData<CachedSocialPlanner>(queryKey) || params.plannerData;
      if (!current || !params.masterToken || !current.pagination?.hasMore) {
        return;
      }

      const cursorSignature = current.pagination.cursorsByAccount
        .map((c) => `${c.pageId}:${c.fbAfterCursor || ""}:${c.igAfterCursor || ""}`)
        .join("|");
      const dedupeKey = `${cacheKey}:page:${cursorSignature}`;

      if (mountedRef.current) {
        setIsLoadingMorePages(true);
        setPaginationError(null);
      }

      try {
        const nextResult = await runSharedSocialSync(
          dedupeKey,
          () =>
            fetchNextPlannerPostsPage({
              current,
              accounts: params.accounts,
              selectedPageId: canonicalPage || "all",
              masterToken: params.masterToken,
              tenantId,
              pagesToFetch,
            }),
          {
            dataClass: "planner",
            accountScope: canonicalPage || "all",
            network,
            period: "planner",
          }
        );

        const nextSnapshotAt = new Date().toISOString();
        const mergePostsKeepingInsights = (prev: CachedSocialPlanner | undefined): CachedSocialPlanner => {
          if (!prev) {
            return {
              ...nextResult,
              snapshotAt: current.snapshotAt || nextSnapshotAt,
              fromCache: false,
            };
          }
          const prevById = new Map(prev.posts.map((p) => [p.id, p]));
          const mergedPosts = nextResult.posts.map((post) => {
            const existing = prevById.get(post.id);
            if (
              existing &&
              post.insightsStatus === "pending" &&
              (existing.insightsStatus === "loaded" || existing.insightsStatus === "unavailable")
            ) {
              return {
                ...post,
                reach_count: existing.reach_count,
                impressions_count: existing.impressions_count,
                saves_count: existing.saves_count,
                shares_count: existing.shares_count,
                insightsStatus: existing.insightsStatus,
              };
            }
            return post;
          });
          // Reincorpora posts que já existiam em prev caso algum tenha sido adicionado concorrentemente
          const seen = new Set(mergedPosts.map((p) => p.id));
          for (const prevPost of prev.posts) {
            if (!seen.has(prevPost.id)) mergedPosts.push(prevPost);
          }

          const updated: CachedSocialPlanner = {
            ...prev,
            ...nextResult,
            posts: mergedPosts,
            snapshotAt: prev.snapshotAt || nextSnapshotAt,
            fromCache: false,
          };
          writeSocialCacheEnvelope(
            cacheKey,
            {
              ...keyParams,
              snapshotAt: updated.snapshotAt || nextSnapshotAt,
            },
            updated
          );
          return updated;
        };

        qc.setQueryData<CachedSocialPlanner | undefined>(queryKey, (prev) =>
          mergePostsKeepingInsights(prev)
        );

        if (mountedRef.current && nextResult.errorMessage) {
          setPaginationError(nextResult.errorMessage);
        }
      } catch (err: any) {
        if (mountedRef.current) {
          setPaginationError(
            err?.message || "Falha ao carregar mais publicações da Meta."
          );
        }
      } finally {
        if (mountedRef.current) {
          setIsLoadingMorePages(false);
        }
      }
    },
    [
      qc,
      queryKey,
      params.plannerData,
      params.masterToken,
      params.accounts,
      cacheKey,
      canonicalPage,
      tenantId,
      network,
      keyParams,
    ]
  );

  // Para conta única, carrega progressivamente a página 3 em background após o 1º render rápido
  // (preserva carga inicial veloz sem truncar de 180 para 120; páginas 4+ ficam disponíveis via cursor explícito)
  useEffect(() => {
    if (
      params.enabled === false ||
      !params.masterToken ||
      !canonicalPage ||
      canonicalPage === "all" ||
      !pagination?.hasMore ||
      isLoadingMorePages
    ) {
      return;
    }

    const needsPage3 = pagination.cursorsByAccount.some(
      (c) => (c.fbHasMore && c.fbPagesLoaded < 3) || (c.igHasMore && c.igPagesLoaded < 3)
    );
    if (!needsPage3) return;

    const triggerKey = `${cacheKey}:stage3`;
    if (autoStage3TriggeredRef.current.has(triggerKey)) return;
    autoStage3TriggeredRef.current.add(triggerKey);

    void loadMorePages(1);
  }, [
    params.enabled,
    params.masterToken,
    canonicalPage,
    pagination,
    isLoadingMorePages,
    cacheKey,
    loadMorePages,
  ]);

  return {
    isLoadingMorePages,
    loadMorePages,
    hasMorePages,
    isPartialSample,
    igTotalMediaCount,
    paginationError,
    loadedPagesSummary: useMemo(() => {
      if (!pagination?.cursorsByAccount?.length) return null;
      const maxFb = Math.max(0, ...pagination.cursorsByAccount.map((c) => c.fbPagesLoaded));
      const maxIg = Math.max(0, ...pagination.cursorsByAccount.map((c) => c.igPagesLoaded));
      return { maxFbPages: maxFb, maxIgPages: maxIg };
    }, [pagination]),
  };
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
          const sMs = Date.parse(`${input.dateFrom}T00:00:00Z`);
          const eMs = Date.parse(`${input.dateTo}T00:00:00Z`);
          const rangeDays =
            Number.isFinite(sMs) && Number.isFinite(eMs) && eMs >= sMs
              ? Math.max(1, Math.round((eMs - sMs) / 86_400_000) + 1)
              : 7;
          const chartDays =
            typeof input.chartDaysOverride === "number" && input.chartDaysOverride > 0
              ? input.chartDaysOverride
              : rangeDays;
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
