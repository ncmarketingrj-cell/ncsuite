import { formatCivilDateBR } from "./metricsDomain.ts";

export interface UserHeaderIdentity {
  displayName: string;
  firstName: string;
  roleLabel: string;
  isLoading: boolean;
}

/**
 * Resolve estável de identidade no header (ID 21):
 * evita oscilar exibindo o prefixo cru de e-mail ("nc.marketingrj") ou "Equipe"
 * enquanto o perfil completo ainda está carregando.
 */
export function resolveUserHeaderIdentity(input: {
  profileLoading: boolean;
  fullName?: string | null;
  metadataFullName?: string | null;
  email?: string | null;
  position?: string | null;
  metadataPosition?: string | null;
}): UserHeaderIdentity {
  const fullName = (input.fullName || input.metadataFullName || "").trim();
  const roleFromProfile = (input.position || input.metadataPosition || "").trim();

  if (input.profileLoading && !fullName) {
    return {
      displayName: "Carregando...",
      firstName: "Carregando",
      roleLabel: roleFromProfile || "Carregando perfil...",
      isLoading: true,
    };
  }

  const displayName =
    fullName ||
    (input.email ? input.email.split("@")[0] : "") ||
    "Usuário";
  const firstName = displayName.split(/\s+/)[0] || "Usuário";
  const roleLabel =
    roleFromProfile ||
    (input.profileLoading ? "Carregando perfil..." : "Equipe");

  return {
    displayName,
    firstName,
    roleLabel,
    isLoading: Boolean(input.profileLoading && !fullName),
  };
}

/**
 * Sanitiza URLs externas aceitando apenas http/https válidos (IDs 30, 31).
 */
export function sanitizeExternalUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return null;
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!candidate.includes(".") || /\s/.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Extrai ID de 11 caracteres do YouTube de URLs watch, youtu.be, shorts ou embed (IDs 30, 31).
 */
export function extractYouTubeVideoId(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const sanitized = sanitizeExternalUrl(trimmed);
  if (!sanitized) return null;

  try {
    const parsed = new URL(sanitized);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const seg = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(seg) ? seg : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const vParam = parsed.searchParams.get("v") || "";
      if (/^[A-Za-z0-9_-]{11}$/.test(vParam)) return vParam;

      const parts = parsed.pathname.split("/").filter(Boolean);
      const markerIdx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
      if (markerIdx >= 0 && parts[markerIdx + 1]) {
        const id = parts[markerIdx + 1];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeWhatsappDigits(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export interface LinkItemValidation {
  valid: boolean;
  reason?: string;
  sanitizedUrl?: string;
  youtubeId?: string;
  whatsappDigits?: string;
}

export function validatePublicLinkItem(item: {
  type?: string | null;
  title?: string | null;
  url?: string | null;
  is_active?: boolean | null;
}): LinkItemValidation {
  if (item.is_active === false) {
    return { valid: false, reason: "Bloco desativado" };
  }

  const title = (item.title || "").trim();
  const url = (item.url || "").trim();
  const type = (item.type || "link").toLowerCase();

  if (type === "youtube") {
    const youtubeId = extractYouTubeVideoId(url);
    if (!youtubeId) {
      return { valid: false, reason: "URL do YouTube ausente ou inválida" };
    }
    return { valid: true, youtubeId };
  }

  if (type === "whatsapp") {
    const whatsappDigits = normalizeWhatsappDigits(url);
    if (!whatsappDigits) {
      return { valid: false, reason: "Número de WhatsApp incompleto (mín. 10 dígitos)" };
    }
    return { valid: true, whatsappDigits };
  }

  if (!url) {
    return {
      valid: false,
      reason: title === "Novo Botão" ? "Botão placeholder sem destino definido" : "URL de destino vazia",
    };
  }

  const sanitizedUrl = sanitizeExternalUrl(url);
  if (!sanitizedUrl) {
    return { valid: false, reason: "URL de destino inválida ou insegura" };
  }

  return { valid: true, sanitizedUrl };
}

export function validateLeadSubmission(input: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle?: string | null;
}): {
  valid: boolean;
  error?: string;
  sanitized?: { name: string; phone: string; email: string | null; vehicle_interest: string | null };
} {
  const name = (input.name || "").trim();
  const phone = (input.phone || "").trim();
  const email = (input.email || "").trim();
  const vehicle = (input.vehicle || "").trim();

  if (name.length < 2) {
    return { valid: false, error: "Informe um nome válido para continuar." };
  }

  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 8) {
    return { valid: false, error: "Informe um WhatsApp/telefone válido com DDD." };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: "E-mail inválido." };
  }

  return {
    valid: true,
    sanitized: {
      name,
      phone,
      email: email || null,
      vehicle_interest: vehicle || null,
    },
  };
}

export function buildTrackedPageUrl(
  origin: string,
  slug: string,
  utm: { source?: string; medium?: string; campaign?: string; content?: string; term?: string }
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (utm.source?.trim()) params.set("utm_source", utm.source.trim());
  if (utm.medium?.trim()) params.set("utm_medium", utm.medium.trim());
  if (utm.campaign?.trim()) params.set("utm_campaign", utm.campaign.trim());
  if (utm.content?.trim()) params.set("utm_content", utm.content.trim());
  if (utm.term?.trim()) params.set("utm_term", utm.term.trim());

  const qs = params.toString();
  return `${cleanOrigin}/p/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
}

export function classifyLinkPageKind(page: {
  template?: string | null;
  lead_form_enabled?: boolean | null;
}): "form" | "link_bio" {
  if (page.template === "form_only") return "form";
  if (!page.template && Boolean(page.lead_form_enabled)) return "form";
  return "link_bio";
}

export function resolveCrmEmptyState(params: {
  totalLeads: number;
  filteredLeadsCount: number;
  hasActiveFilter: boolean;
}): { title: string; description: string; showResetFilters: boolean } {
  if (params.totalLeads === 0) {
    return {
      title: "Nenhum lead capturado ainda",
      description: "Compartilhe um formulário ou URL com UTM para iniciar a captação no CRM.",
      showResetFilters: false,
    };
  }

  if (params.filteredLeadsCount === 0 && params.hasActiveFilter) {
    return {
      title: "Nenhum lead corresponde aos filtros",
      description: "Ajuste ou limpe os filtros de busca e status para visualizar os leads.",
      showResetFilters: true,
    };
  }

  return {
    title: "Nenhum lead encontrado",
    description: "Não há registros disponíveis no momento.",
    showResetFilters: false,
  };
}

export function formatMindMapDisambiguatedLabel(
  map: { id: string; title: string; updated_at?: string | null; ad_account_id?: string | null },
  accountName?: string | null
): string {
  const shortId = map.id.slice(0, 6);
  const datePart = map.updated_at ? formatCivilDateBR(map.updated_at.slice(0, 10)) : "";
  const accountPart = accountName ? ` · ${accountName}` : "";
  const dateSuffix = datePart && datePart !== "—" ? ` · ${datePart}` : "";
  return `${map.title} (#${shortId}${accountPart}${dateSuffix})`;
}

export interface SocialNetworkSplit {
  instagram: {
    postsCount: number;
    reach: number;
    interactions: number;
    avgEngRate: number;
    denominatorLabel: string;
  };
  facebook: {
    postsCount: number;
    reach: number;
    interactions: number;
    avgEngRate: number | null;
    denominatorLabel: string;
  };
  combined: {
    totalPosts: number;
    totalInteractions: number;
  };
}

/**
 * Separa métricas orgânicas de Instagram e Facebook com denominadores explícitos (ID 39),
 * evitando diluir a taxa de engajamento do IG com posts do FB que não expõem reach_count.
 */
export function computeSocialAuditNetworkSplit(
  posts: Array<{
    platform?: string | null;
    reach_count?: number | null;
    likes_count?: number | null;
    comments_count?: number | null;
    saved_count?: number | null;
    shares_count?: number | null;
    total_interactions?: number | null;
    engagement_rate?: number | null;
  }>,
  kpis: {
    reachIg?: number;
    interactionsIg?: number;
    interactionsFb?: number;
  }
): SocialNetworkSplit {
  const igPosts = posts.filter((p) => p.platform === "instagram");
  const fbPosts = posts.filter((p) => p.platform === "facebook");

  const igPostsReach = igPosts.reduce((s, p) => s + (p.reach_count || 0), 0);
  const igReach = (kpis.reachIg || 0) > 0 ? Number(kpis.reachIg) : igPostsReach;
  const igPostsInter = igPosts.reduce(
    (s, p) =>
      s +
      (p.total_interactions ||
        (p.likes_count || 0) + (p.comments_count || 0) + (p.saved_count || 0) + (p.shares_count || 0)),
    0
  );
  const igInter = (kpis.interactionsIg || 0) > 0 ? Number(kpis.interactionsIg) : igPostsInter;
  const igEngPostsWithReach = igPosts.filter((p) => (p.reach_count || 0) > 0);
  const igAvgEngRate =
    igEngPostsWithReach.length > 0
      ? igEngPostsWithReach.reduce((s, p) => s + (p.engagement_rate || 0), 0) / igEngPostsWithReach.length
      : igReach > 0
      ? (igInter / igReach) * 100
      : 0;

  const fbPostsReach = fbPosts.reduce((s, p) => s + (p.reach_count || 0), 0);
  const fbPostsInter = fbPosts.reduce(
    (s, p) =>
      s +
      (p.total_interactions ||
        (p.likes_count || 0) + (p.comments_count || 0) + (p.saved_count || 0) + (p.shares_count || 0)),
    0
  );
  const fbInter = (kpis.interactionsFb || 0) > 0 ? Number(kpis.interactionsFb) : fbPostsInter;
  const fbPostsWithReach = fbPosts.filter((p) => (p.reach_count || 0) > 0);
  const fbAvgEngRate =
    fbPostsWithReach.length > 0
      ? fbPostsWithReach.reduce((s, p) => s + (p.engagement_rate || 0), 0) / fbPostsWithReach.length
      : fbPostsReach > 0
      ? (fbInter / fbPostsReach) * 100
      : null;

  return {
    instagram: {
      postsCount: igPosts.length,
      reach: igReach,
      interactions: igInter,
      avgEngRate: igAvgEngRate,
      denominatorLabel:
        igEngPostsWithReach.length > 0
          ? `Média em ${igEngPostsWithReach.length} post(s) IG com alcance medido`
          : igReach > 0
          ? "Interações IG / Alcance IG da conta"
          : "Sem alcance IG medido na janela",
    },
    facebook: {
      postsCount: fbPosts.length,
      reach: fbPostsReach,
      interactions: fbInter,
      avgEngRate: fbAvgEngRate,
      denominatorLabel:
        fbAvgEngRate !== null
          ? `Média em ${fbPostsWithReach.length} post(s) FB com alcance`
          : "API Graph do Feed FB não fornece alcance individual por post",
    },
    combined: {
      totalPosts: posts.length,
      totalInteractions: igInter + fbInter,
    },
  };
}
