import { useSyncExternalStore } from "react";
import type { SocialNetworkScope } from "./socialCacheDomain";

interface SocialHubFilterState {
  selectedPage: string;
  selectedAccountLabel: string | null;
  selectedNetwork: SocialNetworkScope;
}

const STORAGE_KEY = "nc_social_hub_filters_v1";
const TENANT_STORAGE_KEY = "nc_social_hub_tenant_v1";

export function normalizeSelectedPageId(raw?: string | null): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed === "all" || trimmed === "consolidated") {
    return "all";
  }
  return trimmed;
}

export function canonicalizeSocialPageId<
  T extends { page_id: string; instagram_account_id?: string | null }
>(rawPageId: string | null | undefined, accounts: T[]): string {
  const normalized = normalizeSelectedPageId(rawPageId);
  if (normalized === "all") return "all";
  if (!Array.isArray(accounts) || accounts.length === 0) return normalized;
  const byPage = accounts.find((acc) => acc.page_id === normalized);
  if (byPage) return byPage.page_id;
  const byIg = accounts.find((acc) => acc.instagram_account_id === normalized);
  if (byIg) return byIg.page_id;
  return normalized;
}

export function persistLastKnownTenantId(tenantId?: string | null): void {
  const clean = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!clean || clean === "default") return;
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TENANT_STORAGE_KEY, clean);
    if (typeof localStorage !== "undefined") localStorage.setItem(TENANT_STORAGE_KEY, clean);
  } catch {
    // ignore storage errors
  }
}

export function getLastKnownTenantId(preferred?: string | null): string {
  if (typeof preferred === "string" && preferred.trim() && preferred.trim() !== "default") {
    persistLastKnownTenantId(preferred.trim());
    return preferred.trim();
  }
  try {
    if (typeof sessionStorage !== "undefined") {
      const s = sessionStorage.getItem(TENANT_STORAGE_KEY);
      if (s && s.trim()) return s.trim();
    }
    if (typeof localStorage !== "undefined") {
      const l = localStorage.getItem(TENANT_STORAGE_KEY);
      if (l && l.trim()) return l.trim();
    }
  } catch {
    // ignore storage errors
  }
  return "default";
}

function readStoredFilterJson(): Record<string, unknown> {
  const tryParse = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };
  if (typeof sessionStorage !== "undefined") {
    const s = tryParse(sessionStorage.getItem(STORAGE_KEY));
    if (s) return s;
  }
  if (typeof localStorage !== "undefined") {
    const l = tryParse(localStorage.getItem(STORAGE_KEY));
    if (l) return l;
  }
  return {};
}

function loadInitialState(): SocialHubFilterState {
  if (typeof window === "undefined") {
    return { selectedPage: "all", selectedAccountLabel: null, selectedNetwork: "all" };
  }
  try {
    const sp = new URLSearchParams(window.location.search);
    const urlAccRaw = sp.get("account");
    const parsed = readStoredFilterJson();
    const net = parsed?.selectedNetwork;
    const storedPage = normalizeSelectedPageId(
      typeof parsed?.selectedPage === "string" ? parsed.selectedPage : "all"
    );
    const selectedPage = urlAccRaw ? normalizeSelectedPageId(urlAccRaw) : storedPage;
    const selectedAccountLabel =
      selectedPage !== "all" && typeof parsed?.selectedAccountLabel === "string"
        ? parsed.selectedAccountLabel
        : null;
    return {
      selectedPage,
      selectedAccountLabel,
      selectedNetwork:
        net === "instagram" || net === "facebook" || net === "all" ? net : "all",
    };
  } catch {
    return { selectedPage: "all", selectedAccountLabel: null, selectedNetwork: "all" };
  }
}

let currentState: SocialHubFilterState = loadInitialState();
const listeners = new Set<() => void>();

function persistState(next: SocialHubFilterState) {
  const payload = JSON.stringify(next);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, payload);
    }
  } catch {
    // ignore storage errors
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, payload);
    }
  } catch {
    // ignore storage errors
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (ev) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue);
      const nextPage = normalizeSelectedPageId(
        typeof parsed?.selectedPage === "string" ? parsed.selectedPage : "all"
      );
      const nextNet =
        parsed?.selectedNetwork === "instagram" ||
        parsed?.selectedNetwork === "facebook" ||
        parsed?.selectedNetwork === "all"
          ? parsed.selectedNetwork
          : currentState.selectedNetwork;
      const nextLabel =
        nextPage === "all"
          ? null
          : typeof parsed?.selectedAccountLabel === "string"
          ? parsed.selectedAccountLabel
          : currentState.selectedAccountLabel;
      if (
        nextPage !== currentState.selectedPage ||
        nextNet !== currentState.selectedNetwork ||
        nextLabel !== currentState.selectedAccountLabel
      ) {
        currentState = {
          selectedPage: nextPage,
          selectedAccountLabel: nextLabel,
          selectedNetwork: nextNet,
        };
        listeners.forEach((l) => l());
      }
    } catch {
      // ignore malformed cross-tab value
    }
  });
}

export function setSocialSelectedPage(pageId: string, accountLabel?: string | null): void {
  const normalized = normalizeSelectedPageId(pageId);
  const nextLabel =
    normalized === "all"
      ? null
      : typeof accountLabel === "string" && accountLabel.trim()
      ? accountLabel.trim()
      : normalized === currentState.selectedPage
      ? currentState.selectedAccountLabel
      : null;

  if (
    currentState.selectedPage === normalized &&
    currentState.selectedAccountLabel === nextLabel
  ) {
    return;
  }

  currentState = {
    ...currentState,
    selectedPage: normalized,
    selectedAccountLabel: nextLabel,
  };
  persistState(currentState);
  listeners.forEach((l) => l());
}

export function resetSocialHubFiltersForTests(): void {
  currentState = { selectedPage: "all", selectedAccountLabel: null, selectedNetwork: "all" };
  persistState(currentState);
  listeners.forEach((l) => l());
}

export function setSocialSelectedNetwork(network: SocialNetworkScope): void {
  if (currentState.selectedNetwork === network) return;
  currentState = { ...currentState, selectedNetwork: network };
  persistState(currentState);
  listeners.forEach((l) => l());
}

export function getSocialHubFilterSnapshot(): SocialHubFilterState {
  return currentState;
}

export function useSocialHubFilters(): SocialHubFilterState & {
  setSelectedPage: (pageId: string, accountLabel?: string | null) => void;
  setSelectedNetwork: (network: SocialNetworkScope) => void;
} {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSocialHubFilterSnapshot,
    getSocialHubFilterSnapshot
  );

  return {
    ...state,
    setSelectedPage: setSocialSelectedPage,
    setSelectedNetwork: setSocialSelectedNetwork,
  };
}
