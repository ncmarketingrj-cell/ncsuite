import { useSyncExternalStore } from "react";
import type { SocialNetworkScope } from "./socialCacheDomain";

interface SocialHubFilterState {
  selectedPage: string;
  selectedNetwork: SocialNetworkScope;
}

const STORAGE_KEY = "nc_social_hub_filters_v1";

function loadInitialState(): SocialHubFilterState {
  if (typeof window === "undefined") {
    return { selectedPage: "all", selectedNetwork: "all" };
  }
  try {
    const sp = new URLSearchParams(window.location.search);
    const urlAcc = sp.get("account");
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const net = parsed?.selectedNetwork;
    return {
      selectedPage: urlAcc || (typeof parsed?.selectedPage === "string" ? parsed.selectedPage : "all"),
      selectedNetwork:
        net === "instagram" || net === "facebook" || net === "all" ? net : "all",
    };
  } catch {
    return { selectedPage: "all", selectedNetwork: "all" };
  }
}

let currentState: SocialHubFilterState = loadInitialState();
const listeners = new Set<() => void>();

function persistState(next: SocialHubFilterState) {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
}

export function setSocialSelectedPage(pageId: string): void {
  const normalized = pageId || "all";
  if (currentState.selectedPage === normalized) return;
  currentState = { ...currentState, selectedPage: normalized };
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
  setSelectedPage: (pageId: string) => void;
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
