// Pure presentation & navigation helpers for Global Alert UX
// Does NOT modify or interfere with alert generation rules.

export interface ToastCandidate {
  id: string;
  title: string;
  message: string;
  displayTitle?: string;
  displayMessage?: string;
  accountName?: string;
  campaignName?: string;
  category?: string;
  categoryLabel?: string;
  link?: string | null;
  created_at: string;
  is_read: boolean;
  is_dismissed?: boolean;
}

export interface ParsedNotificationLink {
  to: string;
  search: Record<string, string>;
}

const MAX_SEEN_IDS = 250;

export function parseNotificationTargetLink(rawLink?: string | null): ParsedNotificationLink {
  const fallback: ParsedNotificationLink = { to: "/automacoes", search: { tab: "notificacoes" } };
  if (!rawLink || typeof rawLink !== "string") return fallback;

  const trimmed = rawLink.trim();
  if (!trimmed) return fallback;

  try {
    const normalizedPath = trimmed.startsWith("/campanhas")
      ? trimmed.replace(/^\/campanhas/, "/metricas")
      : trimmed;
    const url = new URL(normalizedPath, "https://ncsuite.local");
    const pathname = url.pathname || "/automacoes";
    const search: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      if (value) search[key] = value;
    });
    if (pathname === "/automacoes" && !search.tab) {
      search.tab = "notificacoes";
    }
    return { to: pathname, search };
  } catch {
    return fallback;
  }
}

export function getToastStorageKey(userId?: string | null): string {
  return `nc_alert_toast_seen_v1:${userId || "anon"}`;
}

export function loadSeenToastIds(userId?: string | null): Set<string> {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(getToastStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function persistSeenToastIds(userId: string | null | undefined, seenIds: Set<string>): void {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    const capped = Array.from(seenIds).slice(-MAX_SEEN_IDS);
    localStorage.setItem(getToastStorageKey(userId), JSON.stringify(capped));
  } catch {
    // ignore storage quota failures
  }
}

export function selectPendingToastQueue<T extends ToastCandidate>(
  notifications: T[],
  seenIds: Set<string>,
  maxVisible = 3
): {
  queue: T[];
  pendingUnreadTotal: number;
} {
  const unreadActive = notifications.filter((n) => !n.is_read && !n.is_dismissed);
  const unseen = unreadActive.filter((n) => !seenIds.has(n.id));
  return {
    queue: unseen.slice(0, maxVisible),
    pendingUnreadTotal: unreadActive.length,
  };
}
