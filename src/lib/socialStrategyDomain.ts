import type { RealSocialAccount, RealSocialPost, PlannerPost } from "@/lib/metaSocialService";
import type { SocialDataState } from "@/lib/metaSocialErrors";

// ============================================================================
// 1. NAVEGAÇÃO SIMPLIFICADA DO HUB SOCIAL (5 BLOCOS CLAROS NO DESKTOP E MOBILE)
// ============================================================================

export type SocialNavGroupId =
  | "visao_geral"
  | "conteudo"
  | "projetos"
  | "inteligencia"
  | "estrategia";

export interface SocialSubNavItem {
  to: string;
  label: string;
  description: string;
}

export interface SocialNavGroup {
  id: SocialNavGroupId;
  label: string;
  to: string;
  activePrefixes: string[];
  children?: SocialSubNavItem[];
}

export const SOCIAL_HUB_NAV_GROUPS: SocialNavGroup[] = [
  {
    id: "visao_geral",
    label: "Hoje",
    to: "/social-hub",
    activePrefixes: ["/social-hub"],
  },
  {
    id: "conteudo",
    label: "Conteúdo",
    to: "/social-conteudo",
    activePrefixes: ["/social-conteudo", "/social"],
    children: [
      {
        to: "/social-conteudo",
        label: "Ideias & Roteiros",
        description: "Pautas, roteiros e aprovação",
      },
      {
        to: "/social",
        label: "Calendário & Feed",
        description: "Agendamentos, grade e publicação",
      },
    ],
  },
  {
    id: "projetos",
    label: "Tarefas",
    to: "/social-projetos",
    activePrefixes: ["/social-projetos"],
  },
  {
    id: "inteligencia",
    label: "Métricas",
    to: "/social-insights",
    activePrefixes: ["/social-insights", "/social-audit", "/social-testes"],
    children: [
      {
        to: "/social-insights",
        label: "Insights",
        description: "Alcance, seguidores e interações",
      },
      {
        to: "/social-audit",
        label: "Auditoria",
        description: "Desempenho de formatos e posts",
      },
      {
        to: "/social-testes",
        label: "Testes",
        description: "Experimentos e aprendizados",
      },
    ],
  },
  {
    id: "estrategia",
    label: "Estratégia",
    to: "/social-estrategia",
    activePrefixes: ["/social-estrategia", "/link-bio", "/formulario", "/quiz", "/organizador"],
    children: [
      {
        to: "/social-estrategia",
        label: "Estratégia",
        description: "Objetivo, público e pilares da conta",
      },
      { to: "/link-bio", label: "Link Bio", description: "Links na bio" },
      { to: "/formulario", label: "Formulário", description: "Captação de leads" },
      { to: "/quiz", label: "Quiz", description: "Qualificação interativa" },
      { to: "/organizador", label: "Organizador", description: "Notas e links rápidos" },
    ],
  },
];

export const SOCIAL_HUB_ALL_ROUTE_PREFIXES = [
  "/social-hub",
  "/social-estrategia",
  "/social-conteudo",
  "/social-insights",
  "/social-audit",
  "/social-testes",
  "/social-projetos",
  "/social",
  "/organizador",
  "/link-bio",
  "/quiz",
  "/formulario",
];

function matchRoutePrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  if (prefix === "/social") {
    // Evita que "/social-insights" ou "/social-hub" ativem a rota exata do Planejador "/social"
    return pathname === "/social" || pathname.startsWith("/social/");
  }
  return pathname.startsWith(`${prefix}/`) || pathname === prefix;
}

export function isSocialHubRoute(pathname: string): boolean {
  return SOCIAL_HUB_ALL_ROUTE_PREFIXES.some((prefix) => matchRoutePrefix(pathname, prefix));
}

export function getActiveSocialNavGroup(pathname: string): SocialNavGroupId {
  for (const group of SOCIAL_HUB_NAV_GROUPS) {
    if (group.activePrefixes.some((prefix) => matchRoutePrefix(pathname, prefix))) {
      return group.id;
    }
  }
  return "visao_geral";
}

// ============================================================================
// 2. CONTEXTO COMPARTILHADO POR CONTA & ESTADOS DE MÉTRICA
// ============================================================================

export type MetricVisualState =
  | "loading"
  | "available"
  | "unavailable_fb_only"
  | "permission_denied"
  | "rate_limited"
  | "error"
  | "unavailable";

export interface MetricDisplayResolution {
  visualState: MetricVisualState;
  displayText: string;
  numericValue: number | null;
  reason: string | null;
}

export interface SocialAccountClassification {
  pageId: string;
  name: string;
  hasInstagram: boolean;
  hasFacebook: boolean;
  networkCapability: "ig_and_fb" | "fb_only";
  isAutomotive: boolean;
  isMvmRestrictedCase: boolean;
}

const AUTOMOTIVE_NAME_PATTERN =
  /(?:car\b|cars\b|\bcarro|ve[ií]culos?|\bmotos?\b|autom[oó]veis|multimarcas|garage|motors|\balug\s*motos\b|\bmove\s*aluguel\b)/i;

export function isLikelyAutomotiveAccountName(accountName: string): boolean {
  if (!accountName) return false;
  return AUTOMOTIVE_NAME_PATTERN.test(accountName);
}

export function classifySocialAccount(
  account: Pick<RealSocialAccount, "page_id" | "page_name" | "instagram_account_id" | "instagram_handle">,
  strategyOverride?: { is_automotive?: boolean | null } | null
): SocialAccountClassification {
  const hasInstagram = Boolean(account.instagram_account_id && String(account.instagram_account_id).trim());
  const normalizedName = String(account.page_name || "").trim();
  const isMvm = /mvm\s*brasil\s*benef[ií]cios/i.test(normalizedName);
  const isAutomotive =
    typeof strategyOverride?.is_automotive === "boolean"
      ? strategyOverride.is_automotive
      : isLikelyAutomotiveAccountName(normalizedName);

  return {
    pageId: String(account.page_id),
    name: normalizedName || `Conta ${account.page_id}`,
    hasInstagram,
    hasFacebook: true,
    networkCapability: hasInstagram ? "ig_and_fb" : "fb_only",
    isAutomotive,
    isMvmRestrictedCase: isMvm,
  };
}

export function resolveMetricDisplayState(params: {
  rawValue: number | null | undefined;
  isInstagramExclusive?: boolean;
  accountClassification?: SocialAccountClassification | null;
  sectionState?: SocialDataState;
  sectionMessage?: string | null;
  fieldAvailability?: "available" | "unavailable" | "error";
  isLoading?: boolean;
  formatter?: (val: number) => string;
}): MetricDisplayResolution {
  const {
    rawValue,
    isInstagramExclusive = false,
    accountClassification,
    sectionState = "success",
    sectionMessage = null,
    fieldAvailability,
    isLoading = false,
    formatter = (n) => n.toLocaleString("pt-BR"),
  } = params;

  if (isLoading || sectionState === "loading") {
    return {
      visualState: "loading",
      displayText: "Carregando...",
      numericValue: null,
      reason: "Consultando dados da conta selecionada.",
    };
  }

  if (isInstagramExclusive && accountClassification && !accountClassification.hasInstagram) {
    return {
      visualState: "unavailable_fb_only",
      displayText: "N/A",
      numericValue: null,
      reason: "Conta configurada apenas com Facebook (sem perfil Instagram vinculado).",
    };
  }

  if (sectionState === "permission_denied" || sectionState === "token_expired") {
    return {
      visualState: "permission_denied",
      displayText: "Indisponível (permissão)",
      numericValue: null,
      reason:
        sectionMessage ||
        "Permissão insuficiente na Meta para consultar este indicador nesta conta.",
    };
  }

  if (sectionState === "rate_limited") {
    return {
      visualState: "rate_limited",
      displayText: "Limite temporário",
      numericValue: null,
      reason:
        sectionMessage ||
        "A Meta limitou temporariamente novas consultas. Aguarde antes de atualizar novamente.",
    };
  }

  if (sectionState === "error" || fieldAvailability === "error") {
    return {
      visualState: "error",
      displayText: "Erro ao consultar",
      numericValue: null,
      reason: sectionMessage || "Falha ao carregar este indicador na API.",
    };
  }

  if (fieldAvailability === "unavailable" || rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue))) {
    return {
      visualState: "unavailable",
      displayText: "Indisponível",
      numericValue: null,
      reason: sectionMessage || "Métrica não retornada pela plataforma para esta conta/período.",
    };
  }

  const numeric = Number(rawValue);
  return {
    visualState: "available",
    displayText: formatter(numeric),
    numericValue: numeric,
    reason: null,
  };
}

export function formatHumanSyncStatus(params: {
  isLoading: boolean;
  isFetching: boolean;
  isFromFallback?: boolean;
  snapshotAt?: string | null;
  dataState: SocialDataState;
  nowMs?: number;
}): { label: string; tone: "neutral" | "fresh" | "loading" | "warning" | "error" } {
  const { isLoading, isFetching, isFromFallback, snapshotAt, dataState, nowMs = Date.now() } = params;

  if (isLoading) {
    return { label: "Carregando informações da conta", tone: "loading" };
  }
  if (dataState === "permission_denied" || dataState === "token_expired") {
    return { label: "Permissão pendente na conta Meta", tone: "warning" };
  }
  if (dataState === "rate_limited") {
    return { label: "Consultas pausadas temporariamente pela Meta", tone: "warning" };
  }
  if (dataState === "error" && !isFromFallback) {
    return { label: "Não foi possível atualizar agora", tone: "error" };
  }

  let ageLabel = "agora";
  if (snapshotAt) {
    const ts = Date.parse(snapshotAt);
    if (Number.isFinite(ts)) {
      const diffMin = Math.max(0, Math.round((nowMs - ts) / 60_000));
      if (diffMin < 1) ageLabel = "agora mesmo";
      else if (diffMin < 60) ageLabel = `há ${diffMin} min`;
      else {
        const diffHours = Math.round(diffMin / 60);
        ageLabel = diffHours < 24 ? `há ${diffHours}h` : `há ${Math.round(diffHours / 24)}d`;
      }
    }
  }

  if (isFetching) {
    return { label: `Atualizando em segundo plano (${ageLabel})`, tone: "loading" };
  }
  if (isFromFallback) {
    return { label: `Dados salvos (${ageLabel})`, tone: "warning" };
  }
  return { label: `Dados atualizados ${ageLabel}`, tone: "fresh" };
}

export interface ConsolidatedScopeSummary {
  isConsolidated: boolean;
  includedAccounts: Array<{ pageId: string; name: string; networkCapability: "ig_and_fb" | "fb_only" }>;
  igIncludedNames: string[];
  fbOnlyNames: string[];
  excludedOrLimitedNotes: string[];
  comparableWarning: string | null;
}

export function buildConsolidatedScopeSummary(params: {
  selectedPage: string;
  targetAccounts: RealSocialAccount[];
  allAccounts: RealSocialAccount[];
  strategyByPageId?: Map<string, { is_automotive?: boolean | null; primary_objective?: string | null }>;
  restrictedAccountMessages?: Map<string, string>;
}): ConsolidatedScopeSummary {
  const { selectedPage, targetAccounts, allAccounts, strategyByPageId, restrictedAccountMessages } = params;
  const isConsolidated = selectedPage === "all";

  if (!isConsolidated) {
    const single = targetAccounts[0] || allAccounts.find((a) => a.page_id === selectedPage);
    if (!single) {
      return {
        isConsolidated: false,
        includedAccounts: [],
        igIncludedNames: [],
        fbOnlyNames: [],
        excludedOrLimitedNotes: ["Nenhuma conta selecionada."],
        comparableWarning: null,
      };
    }
    const cls = classifySocialAccount(single, strategyByPageId?.get(single.page_id));
    return {
      isConsolidated: false,
      includedAccounts: [{ pageId: cls.pageId, name: cls.name, networkCapability: cls.networkCapability }],
      igIncludedNames: cls.hasInstagram ? [cls.name] : [],
      fbOnlyNames: cls.hasInstagram ? [] : [cls.name],
      excludedOrLimitedNotes: [],
      comparableWarning: null,
    };
  }

  const included = targetAccounts.map((acc) => classifySocialAccount(acc, strategyByPageId?.get(acc.page_id)));
  const igIncludedNames = included.filter((c) => c.hasInstagram).map((c) => c.name);
  const fbOnlyNames = included.filter((c) => !c.hasInstagram).map((c) => c.name);

  const objectivesSet = new Set(
    included
      .map((c) => strategyByPageId?.get(c.pageId)?.primary_objective?.trim())
      .filter((v): v is string => Boolean(v))
  );

  const excludedOrLimitedNotes: string[] = [];
  if (allAccounts.length > included.length) {
    excludedOrLimitedNotes.push(
      `Amostra consolidada usa ${included.length} de ${allAccounts.length} contas ativas nesta consulta.`
    );
  }
  if (fbOnlyNames.length > 0) {
    excludedOrLimitedNotes.push(
      `Contas apenas Facebook (${fbOnlyNames.join(", ")}) não entram na soma de seguidores/alcance exclusivo de Instagram.`
    );
  }
  restrictedAccountMessages?.forEach((msg, pageId) => {
    const accName = allAccounts.find((a) => a.page_id === pageId)?.page_name || pageId;
    excludedOrLimitedNotes.push(`${accName}: ${msg}`);
  });

  const hasMixedCap = igIncludedNames.length > 0 && fbOnlyNames.length > 0;
  const hasMixedObjectives = objectivesSet.size > 1;
  const comparableWarning =
    hasMixedCap || hasMixedObjectives
      ? "Visão consolidada reúne contas com redes ou objetivos diferentes. Compare resultados finais sempre dentro de uma conta específica."
      : "Visão consolidada: soma apenas indicadores compatíveis das contas incluídas abaixo.";

  return {
    isConsolidated: true,
    includedAccounts: included.map((c) => ({
      pageId: c.pageId,
      name: c.name,
      networkCapability: c.networkCapability,
    })),
    igIncludedNames,
    fbOnlyNames,
    excludedOrLimitedNotes,
    comparableWarning,
  };
}

export type AccountScopedAction = "strategy" | "idea" | "script" | "briefing" | "experiment";

export function requiresExplicitAccountForAction(
  selectedPage: string,
  action: AccountScopedAction
): { allowed: boolean; reason: string | null } {
  if (selectedPage !== "all" && selectedPage.trim().length > 0) {
    return { allowed: true, reason: null };
  }
  const labels: Record<AccountScopedAction, string> = {
    strategy: "definir ou editar a estratégia",
    idea: "criar ideias de conteúdo",
    script: "gerar roteiros com contexto da marca",
    briefing: "montar briefings de produção",
    experiment: "registrar testes de conteúdo",
  };
  return {
    allowed: false,
    reason: `Selecione uma conta específica no seletor acima para ${labels[action]}. Não misturamos estratégia nem fatos comerciais entre clientes na visão consolidada.`,
  };
}

// ============================================================================
// 3. ESTRATÉGIA PERSISTENTE POR CONTA & PROTEÇÃO COMERCIAL / AUTOMOTIVA
// ============================================================================

export interface StrategyCompetitorRef {
  name: string;
  handleOrUrl: string;
  source: string;
  observedAt: string;
  notes: string;
}

export interface StrategySeasonalityItem {
  title: string;
  dateLabel: string;
  objective: string;
  notes: string;
}

export interface StrategyCtaByObjective {
  objective: string;
  cta: string;
}

export interface SocialAccountStrategy {
  id?: string;
  page_id: string;
  client_id?: string | null;
  account_name: string;
  is_automotive: boolean;
  primary_objective: string;
  secondary_objectives: string[];
  target_audience: string;
  audience_segments: string[];
  positioning: string;
  differentials: string[];
  tone_of_voice: string;
  language_guidelines: string;
  editorial_pillars: string[];
  confirmed_offers: string[];
  forbidden_claims: string;
  restrictions: string;
  competitors: StrategyCompetitorRef[];
  seasonality: StrategySeasonalityItem[];
  ctas_by_objective: StrategyCtaByObjective[];
  updated_at?: string | null;
}

export function buildEmptyAccountStrategy(
  account: Pick<RealSocialAccount, "page_id" | "page_name"> | null,
  clientId?: string | null
): SocialAccountStrategy {
  const name = account?.page_name || "";
  const isAutomotive = isLikelyAutomotiveAccountName(name);
  return {
    page_id: account?.page_id || "",
    client_id: clientId ?? null,
    account_name: name,
    is_automotive: isAutomotive,
    primary_objective: "",
    secondary_objectives: [],
    target_audience: "",
    audience_segments: [],
    positioning: "",
    differentials: [],
    tone_of_voice: "",
    language_guidelines: "",
    editorial_pillars: [],
    confirmed_offers: [],
    forbidden_claims: isAutomotive
      ? "Nunca inventar preço, quilometragem, ano/modelo, versão exata, taxa ou parcela de financiamento, disponibilidade de estoque ou garantia sem confirmação explícita da loja."
      : "",
    restrictions: "",
    competitors: [],
    seasonality: [],
    ctas_by_objective: [],
  };
}

export interface StrategyReadinessResult {
  completionPercent: number;
  missingCoreFields: string[];
  validationWarnings: string[];
  isReadyForAi: boolean;
}

export function evaluateStrategyReadiness(strategy: SocialAccountStrategy): StrategyReadinessResult {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "Objetivo principal", ok: strategy.primary_objective.trim().length > 0 },
    { label: "Público prioritário", ok: strategy.target_audience.trim().length > 0 },
    { label: "Posicionamento", ok: strategy.positioning.trim().length > 0 },
    { label: "Tom de voz", ok: strategy.tone_of_voice.trim().length > 0 },
    { label: "Pilares editoriais", ok: strategy.editorial_pillars.length > 0 },
    { label: "Ofertas e provas confirmadas", ok: strategy.confirmed_offers.length > 0 },
    { label: "Restrições e fatos proibidos", ok: strategy.forbidden_claims.trim().length > 0 || strategy.restrictions.trim().length > 0 },
    { label: "CTAs por objetivo", ok: strategy.ctas_by_objective.length > 0 },
  ];

  const completed = checks.filter((c) => c.ok).length;
  const missingCoreFields = checks.filter((c) => !c.ok).map((c) => c.label);
  const validationWarnings: string[] = [];

  for (const comp of strategy.competitors) {
    if (!comp.source.trim() || !comp.observedAt.trim()) {
      validationWarnings.push(
        `Concorrente/referência "${comp.name || "sem nome"}" precisa informar origem e data de observação.`
      );
    }
  }

  if (strategy.is_automotive && strategy.confirmed_offers.length === 0) {
    validationWarnings.push(
      "Conta automotiva sem ofertas/estoque confirmados: a IA marcará preço, ano, km e financiamento como pendentes de confirmação."
    );
  }

  const completionPercent = Math.round((completed / checks.length) * 100);
  const isReadyForAi =
    strategy.primary_objective.trim().length > 0 && strategy.editorial_pillars.length > 0;

  return {
    completionPercent,
    missingCoreFields,
    validationWarnings,
    isReadyForAi,
  };
}

export function assertStrategyBelongsToAccount(
  strategy: SocialAccountStrategy | null | undefined,
  pageId: string
): boolean {
  if (!strategy || !pageId || pageId === "all") return false;
  return String(strategy.page_id) === String(pageId);
}

const COMMERCIAL_CLAIM_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "preço ou valor em reais", regex: /r\$\s*\d[\d.,]*/i },
  { label: "quilometragem", regex: /\b\d[\d.]*\s*km\b|quilometragem/i },
  { label: "condição ou parcela de financiamento", regex: /\b(parcela(s)?\s+(a\s+partir|de|fixa)|taxa\s*(zero|0|%)|entrada\s+de|financiamento\s+\d)/i },
  { label: "ano/modelo específico", regex: /\b(ano|modelo)\s*(19\d{2}|20[0-3]\d)\b/i },
  { label: "garantia de disponibilidade em estoque", regex: /\b(pronta\s+entrega|[úu]ltima(s)?\s+unidade(s)?|dispon[íi]vel\s+no\s+p[áa]tio|em\s+estoque\s+agora)\b/i },
];

export function detectUnconfirmedCommercialClaims(
  text: string,
  strategy: SocialAccountStrategy
): string[] {
  if (!text.trim()) return [];
  const confirmedCorpus = [
    ...strategy.confirmed_offers,
    ...strategy.differentials,
  ]
    .join(" ")
    .toLowerCase();

  const flagged: string[] = [];
  for (const rule of COMMERCIAL_CLAIM_PATTERNS) {
    const match = text.match(rule.regex);
    if (!match) continue;
    const snippet = match[0].toLowerCase();
    if (!confirmedCorpus.includes(snippet)) {
      flagged.push(rule.label);
    }
  }
  return Array.from(new Set(flagged));
}

// ============================================================================
// 4. FLUXO DE PRODUÇÃO & APROVAÇÃO (8 ESTÁGIOS + PERMISSÕES + HISTÓRICO)
// ============================================================================

export type ContentPipelineStage =
  | "idea"
  | "briefing"
  | "production"
  | "internal_review"
  | "client_approval"
  | "scheduled"
  | "published"
  | "learning";

export interface ContentStageMetadata {
  id: ContentPipelineStage;
  label: string;
  shortLabel: string;
  order: number;
  requiresEditPermission: boolean;
}

export const CONTENT_PIPELINE_STAGES: ContentStageMetadata[] = [
  { id: "idea", label: "Ideia", shortLabel: "Ideia", order: 0, requiresEditPermission: true },
  { id: "briefing", label: "Briefing", shortLabel: "Briefing", order: 1, requiresEditPermission: true },
  { id: "production", label: "Produção", shortLabel: "Produção", order: 2, requiresEditPermission: true },
  { id: "internal_review", label: "Revisão interna", shortLabel: "Rev. Interna", order: 3, requiresEditPermission: true },
  { id: "client_approval", label: "Aprovação do cliente", shortLabel: "Aprovação", order: 4, requiresEditPermission: true },
  { id: "scheduled", label: "Agendamento", shortLabel: "Agendado", order: 5, requiresEditPermission: true },
  { id: "published", label: "Publicado", shortLabel: "Publicado", order: 6, requiresEditPermission: true },
  { id: "learning", label: "Aprendizado", shortLabel: "Aprendizado", order: 7, requiresEditPermission: true },
];

export interface ContentHistoryEntry {
  at: string;
  actorName: string;
  actorId?: string | null;
  action: string;
  fromStage?: ContentPipelineStage | null;
  toStage?: ContentPipelineStage | null;
  note?: string | null;
}

export interface ContentCommentEntry {
  id: string;
  at: string;
  authorName: string;
  authorId?: string | null;
  text: string;
}

export interface ContentScriptScene {
  scene: string;
  timeRange: string;
  visualAction: string;
  spokenLine: string;
  onScreenText: string;
}

export interface AiGroundingRecord {
  factsUsed: Array<{ fact: string; source: string; period: string }>;
  interpretation: string;
  creativeHypothesis: string;
  generatedAt: string;
  generatedByMode: "victoria_ai" | "structured_template";
  pendingConfirmations: string[];
}

export interface SocialContentItem {
  id: string;
  page_id: string;
  client_id?: string | null;
  account_name: string;
  title: string;
  stage: ContentPipelineStage;
  format: string;
  platform: "instagram" | "facebook" | "both";
  objective: string;
  editorial_pillar: string;
  audience_segment: string;
  origin_insight: string;
  hypothesis: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  effort: "baixo" | "medio" | "alto";
  hook_variations: string[];
  script_scenes: ContentScriptScene[];
  shot_list: string[];
  on_screen_text: string;
  caption: string;
  cta: string;
  cover_suggestion: string;
  brief_notes: string;
  related_materials: string[];
  ai_grounding: AiGroundingRecord | null;
  assignee_id?: string | null;
  assignee_name: string;
  approver_id?: string | null;
  approver_name: string;
  due_at?: string | null;
  scheduled_at?: string | null;
  published_url?: string | null;
  planner_post_id?: string | null;
  meta_post_id?: string | null;
  comments: ContentCommentEntry[];
  history: ContentHistoryEntry[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export function canTransitionContentStage(params: {
  fromStage: ContentPipelineStage;
  toStage: ContentPipelineStage;
  canEditSocial: boolean;
  isApproverOrAdmin?: boolean;
}): { allowed: boolean; reason: string | null } {
  const { fromStage, toStage, canEditSocial, isApproverOrAdmin = canEditSocial } = params;
  if (!canEditSocial) {
    return { allowed: false, reason: "Seu perfil possui acesso somente leitura em Social." };
  }
  if (fromStage === toStage) {
    return { allowed: true, reason: null };
  }
  if ((toStage === "scheduled" || toStage === "published") && !isApproverOrAdmin) {
    return {
      allowed: false,
      reason: "Movimentação para Agendamento/Publicado requer permissão de aprovação.",
    };
  }
  return { allowed: true, reason: null };
}

export function appendContentHistory(
  existing: ContentHistoryEntry[],
  entry: Omit<ContentHistoryEntry, "at"> & { at?: string }
): ContentHistoryEntry[] {
  const next: ContentHistoryEntry = {
    at: entry.at || new Date().toISOString(),
    actorName: entry.actorName || "Equipe",
    actorId: entry.actorId ?? null,
    action: entry.action,
    fromStage: entry.fromStage ?? null,
    toStage: entry.toStage ?? null,
    note: entry.note ?? null,
  };
  return [next, ...(Array.isArray(existing) ? existing : [])].slice(0, 60);
}

// ============================================================================
// 5. GERADOR DE IDEIAS & ROTEIROS COM 3 CAMADAS E ANTI-FABRICAÇÃO
// ============================================================================

export interface AiScriptGenerationInput {
  account: SocialAccountClassification;
  strategy: SocialAccountStrategy;
  pillar: string;
  objective: string;
  audienceSegment: string;
  format: string;
  originInsight: string;
  hypothesis: string;
  periodLabel: string;
  cachedKpisSummary?: string | null;
  topPostTitles?: string[];
  learningsSummary?: string[];
}

export interface AiStructuredScriptDraft {
  title: string;
  grounding: AiGroundingRecord;
  hookVariations: string[];
  scriptScenes: ContentScriptScene[];
  shotList: string[];
  onScreenText: string;
  caption: string;
  cta: string;
  coverSuggestion: string;
  briefNotes: string;
  testApproachVariations: string[];
}

const FORBIDDEN_PROMISE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\bviraliza[çc][aã]o\s+garantida\b/gi, replacement: "maior potencial de retenção (hipótese a testar)" },
  { regex: /\bcrescimento\s+garantido\b/gi, replacement: "hipótese de crescimento sujeita a medição" },
  { regex: /\b100%\s+de\s+alcance\b/gi, replacement: "ampliação de descoberta orgânica (não garantida)" },
  { regex: /\bvai\s+viralizar\b/gi, replacement: "busca testar maior retenção inicial" },
  { regex: /\bresultado\s+garantido\b/gi, replacement: "resultado esperado como hipótese" },
];

export function stripUnfoundedGrowthPromises(text: string): string {
  let clean = String(text || "");
  for (const rule of FORBIDDEN_PROMISE_PATTERNS) {
    clean = clean.replace(rule.regex, rule.replacement);
  }
  return clean;
}

export function buildGroundedFactsFromContext(input: AiScriptGenerationInput): AiGroundingRecord["factsUsed"] {
  const facts: AiGroundingRecord["factsUsed"] = [
    {
      fact: `Conta selecionada: ${input.account.name} (${input.account.networkCapability === "fb_only" ? "apenas Facebook" : "Instagram + Facebook"})`,
      source: "Cadastro Social NC Suite",
      period: "Atual",
    },
  ];

  if (input.strategy.primary_objective.trim()) {
    facts.push({
      fact: `Objetivo estratégico cadastrado: ${input.strategy.primary_objective.trim()}`,
      source: "Estratégia da Conta",
      period: "Atual",
    });
  }

  if (input.strategy.confirmed_offers.length > 0) {
    facts.push({
      fact: `Ofertas/provas confirmadas: ${input.strategy.confirmed_offers.slice(0, 3).join("; ")}`,
      source: "Estratégia da Conta",
      period: "Confirmado pela equipe",
    });
  } else {
    facts.push({
      fact: "Nenhuma oferta comercial específica confirmada na estratégia da conta.",
      source: "Estratégia da Conta",
      period: "Atual",
    });
  }

  if (input.cachedKpisSummary?.trim()) {
    facts.push({
      fact: input.cachedKpisSummary.trim(),
      source: "Cache Meta Insights",
      period: input.periodLabel,
    });
  }

  if (input.topPostTitles && input.topPostTitles.length > 0) {
    facts.push({
      fact: `Publicações recentes de referência: ${input.topPostTitles.slice(0, 2).join(" | ")}`,
      source: "Histórico de Posts Meta",
      period: input.periodLabel,
    });
  }

  if (input.learningsSummary && input.learningsSummary.length > 0) {
    facts.push({
      fact: `Aprendizado anterior validado: ${input.learningsSummary[0]}`,
      source: "Banco de Aprendizados",
      period: "Histórico",
    });
  }

  return facts;
}

export function synthesizeStructuredScript(
  input: AiScriptGenerationInput,
  aiCandidate?: Partial<AiStructuredScriptDraft> | null,
  mode: "victoria_ai" | "structured_template" = "structured_template"
): AiStructuredScriptDraft {
  const factsUsed =
    aiCandidate?.grounding?.factsUsed && aiCandidate.grounding.factsUsed.length > 0
      ? aiCandidate.grounding.factsUsed
      : buildGroundedFactsFromContext(input);

  const pendingConfirmations: string[] = [];
  if (input.account.isAutomotive && input.strategy.confirmed_offers.length === 0) {
    pendingConfirmations.push(
      "Confirmar antes da gravação/publicação: preço exato, ano/modelo, versão, quilometragem e condições reais (não inventar valores)."
    );
  }
  if (!input.strategy.tone_of_voice.trim()) {
    pendingConfirmations.push("Preencher 'Tom de voz' na aba Estratégia para refinar a linguagem da conta.");
  }

  const fallbackInterpretation = input.originInsight.trim()
    ? `Leitura operacional: a pauta parte de "${input.originInsight.trim()}" dentro do pilar "${input.pillar || "principal"}" no período ${input.periodLabel}.`
    : `Leitura operacional: conteúdo desenhado para o pilar "${input.pillar || "educativo/autoridade"}" alinhado ao objetivo "${input.objective || input.strategy.primary_objective || "engajamento qualificado"}".`;

  const fallbackHypothesis = input.hypothesis.trim()
    ? `Hipótese a testar (não é garantia): ${input.hypothesis.trim()}.`
    : `Hipótese a testar (não é garantia): abrir o conteúdo com pergunta prática para "${input.audienceSegment || input.strategy.target_audience || "o público prioritário"}" tende a aumentar retenção e comentários qualificados no formato ${input.format}.`;

  const rawHooks =
    aiCandidate?.hookVariations && aiCandidate.hookVariations.length > 0
      ? aiCandidate.hookVariations
      : [
          `Antes de decidir sobre ${input.pillar || input.account.name}, observe este detalhe prático.`,
          `O erro mais comum de quem procura ${input.audienceSegment || "essa solução"} (e como evitar).`,
          `Pergunta direta que recebemos esta semana em ${input.account.name}:`,
        ];

  const confirmedCta =
    input.strategy.ctas_by_objective.find((c) =>
      c.objective.toLowerCase().includes((input.objective || "").toLowerCase())
    )?.cta ||
    input.strategy.ctas_by_objective[0]?.cta ||
    "Chame no direct ou no WhatsApp oficial da bio para confirmar atendimento e disponibilidade atual.";

  const fallbackScenes: ContentScriptScene[] = [
    {
      scene: "Cena 1 — Gancho",
      timeRange: "0-4s",
      visualAction: `Plano médio/aberto apresentando ${input.account.name} em ambiente real de trabalho`,
      spokenLine: rawHooks[0],
      onScreenText: input.pillar ? input.pillar.toUpperCase() : "ATENÇÃO AO DETALHE",
    },
    {
      scene: "Cena 2 — Contexto & Prova",
      timeRange: "5-18s",
      visualAction: "Cortes próximos mostrando processo real, bastidor ou critério de avaliação",
      spokenLine:
        input.strategy.confirmed_offers[0]
          ? `Na prática, o que confirmamos hoje aqui é: ${input.strategy.confirmed_offers[0]}. [PREENCHER DETALHES CONFIRMADOS]`
          : `Explique o critério prático para o cliente avaliar antes de fechar. ${input.account.isAutomotive ? "[INSERIR APENAS DADOS REAIS DO VEÍCULO CONFIRMADO EM ESTOQUE]" : "[INSERIR PROVA OU EXEMPLO CONFIRMADO]"}`,
      onScreenText: input.account.isAutomotive ? "Dados sujeitos à confirmação de estoque" : "Critério real de escolha",
    },
    {
      scene: "Cena 3 — Fechamento & CTA",
      timeRange: "19-28s",
      visualAction: "Retorno para rosto/assinatura visual da marca com chamada clara",
      spokenLine: confirmedCta,
      onScreenText: "Fale com a equipe no link da bio",
    },
  ];

  const scenes =
    aiCandidate?.scriptScenes && aiCandidate.scriptScenes.length > 0
      ? aiCandidate.scriptScenes
      : fallbackScenes;

  const captionRaw =
    aiCandidate?.caption?.trim() ||
    `${rawHooks[0]}\n\n${input.hypothesis ? `Foco do conteúdo: ${input.hypothesis}` : `Conteúdo focado em ${input.pillar || input.account.name}.`}${input.account.isAutomotive ? "\n\n*Valores, disponibilidade e condições dependem de confirmação vigente diretamente com a loja.*" : ""}\n\n${confirmedCta}`;

  // Verifica alegações comerciais não confirmadas na legenda e falas geradas
  const combinedCopy = [
    captionRaw,
    ...scenes.map((s) => `${s.spokenLine} ${s.onScreenText}`),
  ].join("\n");
  const unconfirmedClaims = detectUnconfirmedCommercialClaims(combinedCopy, input.strategy);
  for (const claim of unconfirmedClaims) {
    pendingConfirmations.push(`Atenção: texto mencionou ${claim} sem confirmação cadastrada na Estratégia.`);
  }

  return {
    title: stripUnfoundedGrowthPromises(
      aiCandidate?.title?.trim() || `${input.format}: ${input.pillar || input.objective || input.account.name}`
    ),
    grounding: {
      factsUsed,
      interpretation: stripUnfoundedGrowthPromises(
        aiCandidate?.grounding?.interpretation?.trim() || fallbackInterpretation
      ),
      creativeHypothesis: stripUnfoundedGrowthPromises(
        aiCandidate?.grounding?.creativeHypothesis?.trim() || fallbackHypothesis
      ),
      generatedAt: new Date().toISOString(),
      generatedByMode: mode,
      pendingConfirmations: Array.from(new Set(pendingConfirmations)),
    },
    hookVariations: rawHooks.map((h) => stripUnfoundedGrowthPromises(h)),
    scriptScenes: scenes.map((s) => ({
      ...s,
      spokenLine: stripUnfoundedGrowthPromises(s.spokenLine),
      onScreenText: stripUnfoundedGrowthPromises(s.onScreenText),
    })),
    shotList:
      aiCandidate?.shotList && aiCandidate.shotList.length > 0
        ? aiCandidate.shotList
        : [
            "Plano 1: Abertura frontal com boa iluminação e áudio limpo (3-4s).",
            "Plano 2: Tomadas em detalhe (B-roll) demonstrando ponto principal sem obstruir o texto.",
            "Plano 3: Encerramento com enquadramento estável para CTA.",
          ],
    onScreenText: stripUnfoundedGrowthPromises(
      aiCandidate?.onScreenText?.trim() || scenes.map((s) => `${s.timeRange}: ${s.onScreenText}`).join(" | ")
    ),
    caption: stripUnfoundedGrowthPromises(captionRaw),
    cta: stripUnfoundedGrowthPromises(aiCandidate?.cta?.trim() || confirmedCta),
    coverSuggestion: stripUnfoundedGrowthPromises(
      aiCandidate?.coverSuggestion?.trim() ||
        `Frame nítido do tema principal com título curto (máx. 5 palavras) em alto contraste.`
    ),
    briefNotes: stripUnfoundedGrowthPromises(
      aiCandidate?.briefNotes?.trim() ||
        `Público: ${input.audienceSegment || input.strategy.target_audience || "Público geral da conta"} | Tom: ${input.strategy.tone_of_voice || "Natural e claro"} | Restrições: ${input.strategy.forbidden_claims || "Sem promessas irreais."}`
    ),
    testApproachVariations:
      aiCandidate?.testApproachVariations && aiCandidate.testApproachVariations.length > 0
        ? aiCandidate.testApproachVariations.map((v) => stripUnfoundedGrowthPromises(v))
        : [
            "Variação A: Abertura com pergunta direta para estimular comentários.",
            "Variação B: Abertura com demonstração prática logo no 1º segundo (sem introdução longa).",
          ],
  };
}

// ============================================================================
// 6. TAREFAS / PROJETOS OPERACIONAIS & RECOMENDAÇÕES EXECUTÁVEIS
// ============================================================================

export type ProjectTaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "waiting_approval"
  | "blocked"
  | "done"
  | "cancelled";

export type ProjectTaskPriority = "baixa" | "media" | "alta" | "urgente";

export type ProjectTaskSourceType =
  | "manual"
  | "idea"
  | "content"
  | "recommendation"
  | "experiment"
  | "approval"
  | "learning";

export interface SocialProjectTask {
  id: string;
  page_id: string | null;
  client_id?: string | null;
  account_name: string;
  title: string;
  description: string;
  task_type: string;
  priority: ProjectTaskPriority;
  status: ProjectTaskStatus;
  assignee_id?: string | null;
  assignee_name: string;
  due_at?: string | null;
  recurrence_rule?: string | null;
  source_type: ProjectTaskSourceType;
  source_id?: string | null;
  linked_content_id?: string | null;
  linked_post_id?: string | null;
  linked_experiment_id?: string | null;
  tags: string[];
  history: Array<{ at: string; actorName: string; change: string }>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionableRecommendation {
  id: string;
  pageId: string;
  accountName: string;
  title: string;
  evidence: string;
  explanation: string;
  actionLabel: string;
  priority: ProjectTaskPriority;
  evidencePostIds: string[];
  targetRoute: "/social-conteudo" | "/social" | "/social-estrategia" | "/social-testes" | "/social-insights";
}

export function createTaskPayloadFromRecommendation(params: {
  recommendation: ActionableRecommendation;
  assigneeId?: string | null;
  assigneeName?: string;
  dueAtIso?: string | null;
}): Omit<SocialProjectTask, "id" | "created_at" | "updated_at"> {
  const { recommendation, assigneeId = null, assigneeName = "", dueAtIso = null } = params;
  return {
    page_id: recommendation.pageId === "all" ? null : recommendation.pageId,
    client_id: null,
    account_name: recommendation.accountName,
    title: recommendation.title,
    description: `Evidência: ${recommendation.evidence}\nLeitura: ${recommendation.explanation}\nPróxima ação: ${recommendation.actionLabel}`,
    task_type: "otimizacao_social",
    priority: recommendation.priority,
    status: "todo",
    assignee_id: assigneeId,
    assignee_name: assigneeName,
    due_at: dueAtIso,
    recurrence_rule: null,
    source_type: "recommendation",
    source_id: recommendation.id,
    linked_content_id: null,
    linked_post_id: null,
    linked_experiment_id: null,
    tags: ["recomendacao_social"],
    history: [
      {
        at: new Date().toISOString(),
        actorName: "Hub Social",
        change: `Tarefa criada a partir de recomendação (${recommendation.id})`,
      },
    ],
    created_by: null,
  };
}

// ============================================================================
// 7. MOTOR DA VISÃO GERAL DIÁRIA (PRIORIDADES, SEMANA E SINAIS DE DESEMPENHO)
// ============================================================================

export interface OverviewWeekSlot {
  dateIso: string;
  weekdayLabel: string;
  scheduledCount: number;
  publishedCount: number;
  inProductionCount: number;
  dueTasksCount: number;
  itemsSummary: string[];
}

export interface OverviewPerformanceHighlight {
  postId: string;
  accountName: string;
  platform: "instagram" | "facebook";
  permalink: string | null;
  captionExcerpt: string;
  relativeScoreLabel: string;
  metricSummary: string;
  direction: "above_baseline" | "below_baseline";
}

export interface SocialDailyOverviewSummary {
  todayPriorities: {
    overdueTasks: SocialProjectTask[];
    dueSoonTasks: SocialProjectTask[];
    awaitingApprovalContent: SocialContentItem[];
    scheduledTodayOrSoon: Array<{ id: string; title: string; scheduledAt: string; platform: string; accountName: string }>;
    pendingByMember: Array<{ memberName: string; openCount: number; overdueCount: number }>;
  };
  weekSummary: {
    days: OverviewWeekSlot[];
    stageCounts: Record<ContentPipelineStage, number>;
    pillarCoverage: Array<{ pillar: string; plannedCount: number }>;
    pillarGaps: string[];
    cadenceNote: string;
  };
  performanceSignals: {
    highlights: OverviewPerformanceHighlight[];
    coverageText: string;
    limitations: string[];
    recommendations: ActionableRecommendation[];
  };
  nextRecommendedAction: ActionableRecommendation | null;
}

export function buildOverviewCommandCenter(params: {
  selectedPage: string;
  accountName: string;
  strategy: SocialAccountStrategy | null;
  tasks: SocialProjectTask[];
  contentItems: SocialContentItem[];
  plannerPosts: PlannerPost[];
  recentPosts: RealSocialPost[];
  periodLabel: string;
  now?: Date;
}): SocialDailyOverviewSummary {
  const {
    selectedPage,
    accountName,
    strategy,
    tasks,
    contentItems,
    plannerPosts,
    recentPosts,
    periodLabel,
    now = new Date(),
  } = params;

  const nowMs = now.getTime();
  const in48hMs = nowMs + 48 * 3_600_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const overdueTasks = openTasks.filter((t) => t.due_at && Date.parse(t.due_at) < nowMs);
  const dueSoonTasks = openTasks.filter((t) => {
    if (!t.due_at) return false;
    const ms = Date.parse(t.due_at);
    return ms >= nowMs && ms <= in48hMs;
  });

  const awaitingApprovalContent = contentItems.filter(
    (c) => c.stage === "internal_review" || c.stage === "client_approval"
  );

  const weekEndMs = startOfToday.getTime() + 7 * 86_400_000;
  const scheduledTodayOrSoon = plannerPosts
    .filter((p) => {
      if (p.status !== "scheduled" && p.status !== "pending_approval") return false;
      const ms = Date.parse(p.scheduled_at || p.published_at || "");
      return Number.isFinite(ms) && ms >= startOfToday.getTime() && ms <= weekEndMs;
    })
    .map((p) => ({
      id: p.id,
      title: (p.content || p.title || "Publicação programada").slice(0, 80),
      scheduledAt: p.scheduled_at || p.published_at || p.created_at,
      platform: p.platform,
      accountName: p.account_name || accountName,
    }));

  const memberMap = new Map<string, { openCount: number; overdueCount: number }>();
  for (const t of openTasks) {
    const key = t.assignee_name?.trim() || "Sem responsável";
    const entry = memberMap.get(key) || { openCount: 0, overdueCount: 0 };
    entry.openCount += 1;
    if (t.due_at && Date.parse(t.due_at) < nowMs) entry.overdueCount += 1;
    memberMap.set(key, entry);
  }
  const pendingByMember = Array.from(memberMap.entries())
    .map(([memberName, counts]) => ({ memberName, ...counts }))
    .sort((a, b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount);

  // Semana de 7 dias
  const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  const days: OverviewWeekSlot[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dayDate = new Date(startOfToday.getTime() + i * 86_400_000);
    const dateIso = dayDate.toISOString().slice(0, 10);
    const scheduledCount = plannerPosts.filter(
      (p) => (p.status === "scheduled" || p.status === "pending_approval") && (p.scheduled_at || "").slice(0, 10) === dateIso
    ).length;
    const publishedCount = plannerPosts.filter(
      (p) => p.status === "published" && (p.published_at || "").slice(0, 10) === dateIso
    ).length;
    const inProductionCount = contentItems.filter(
      (c) => (c.due_at || c.scheduled_at || "").slice(0, 10) === dateIso && c.stage !== "published"
    ).length;
    const dueTasksCount = openTasks.filter((t) => (t.due_at || "").slice(0, 10) === dateIso).length;

    const itemsSummary: string[] = [];
    if (scheduledCount > 0) itemsSummary.push(`${scheduledCount} agend.`);
    if (publishedCount > 0) itemsSummary.push(`${publishedCount} publ.`);
    if (inProductionCount > 0) itemsSummary.push(`${inProductionCount} em prod.`);
    if (dueTasksCount > 0) itemsSummary.push(`${dueTasksCount} tarefa(s)`);

    days.push({
      dateIso,
      weekdayLabel: weekdayFormatter.format(dayDate).replace(".", ""),
      scheduledCount,
      publishedCount,
      inProductionCount,
      dueTasksCount,
      itemsSummary,
    });
  }

  const stageCounts: Record<ContentPipelineStage, number> = {
    idea: 0,
    briefing: 0,
    production: 0,
    internal_review: 0,
    client_approval: 0,
    scheduled: 0,
    published: 0,
    learning: 0,
  };
  for (const item of contentItems) {
    if (item.stage in stageCounts) stageCounts[item.stage] += 1;
  }

  // Lacunas nos pilares definidos pela própria conta (sem impor meta fixa global)
  const configuredPillars = strategy?.editorial_pillars || [];
  const pillarCounts = new Map<string, number>();
  for (const p of configuredPillars) pillarCounts.set(p, 0);
  for (const item of contentItems) {
    if (!item.editorial_pillar) continue;
    pillarCounts.set(item.editorial_pillar, (pillarCounts.get(item.editorial_pillar) || 0) + 1);
  }
  const pillarCoverage = Array.from(pillarCounts.entries()).map(([pillar, plannedCount]) => ({
    pillar,
    plannedCount,
  }));
  const pillarGaps = pillarCoverage.filter((p) => p.plannedCount === 0).map((p) => p.pillar);

  const totalScheduledOrPlanned = scheduledTodayOrSoon.length + contentItems.filter((c) => c.stage !== "published").length;
  const cadenceNote =
    totalScheduledOrPlanned === 0
      ? "Nenhuma pauta em andamento nem publicação programada para os próximos 7 dias."
      : `${scheduledTodayOrSoon.length} publicação(ões) programada(s) e ${contentItems.filter((c) => c.stage !== "published").length} pauta(s) ativa(s) no fluxo.`;

  // Sinais de desempenho baseados na própria mediana histórica dos posts com dados utilizáveis
  const comparablePosts = recentPosts.filter((p) => (p.reach_count ?? 0) > 0 || (p.total_interactions ?? 0) > 0);
  const scoreFor = (p: RealSocialPost) => (p.total_interactions || 0) + (p.reach_count ? p.reach_count * 0.02 : 0);
  const sortedScores = [...comparablePosts].map(scoreFor).sort((a, b) => a - b);
  const median =
    sortedScores.length > 0 ? sortedScores[Math.floor(sortedScores.length / 2)] : 0;

  const highlights: OverviewPerformanceHighlight[] = [];
  if (comparablePosts.length >= 2 && median > 0) {
    const byScore = [...comparablePosts].sort((a, b) => scoreFor(b) - scoreFor(a));
    const top = byScore[0];
    const bottom = byScore[byScore.length - 1];
    if (top && scoreFor(top) >= median) {
      const ratio = median > 0 ? Math.round(((scoreFor(top) - median) / median) * 100) : 0;
      highlights.push({
        postId: top.id,
        accountName: top.accountName,
        platform: top.platform,
        permalink: top.permalink,
        captionExcerpt: (top.content || top.title || "Publicação sem legenda").slice(0, 90),
        relativeScoreLabel: `+${ratio}% vs mediana recente`,
        metricSummary: `Alcance ${top.reach_count ?? "N/D"} • Interações ${top.total_interactions}`,
        direction: "above_baseline",
      });
    }
    if (bottom && bottom.id !== top?.id && scoreFor(bottom) < median) {
      const drop = median > 0 ? Math.round(((median - scoreFor(bottom)) / median) * 100) : 0;
      highlights.push({
        postId: bottom.id,
        accountName: bottom.accountName,
        platform: bottom.platform,
        permalink: bottom.permalink,
        captionExcerpt: (bottom.content || bottom.title || "Publicação sem legenda").slice(0, 90),
        relativeScoreLabel: `-${drop}% vs mediana recente`,
        metricSummary: `Alcance ${bottom.reach_count ?? "N/D"} • Interações ${bottom.total_interactions}`,
        direction: "below_baseline",
      });
    }
  }

  const coverageText =
    recentPosts.length === 0
      ? `Nenhuma publicação recente retornada no período (${periodLabel}).`
      : `${comparablePosts.length} de ${recentPosts.length} publicações com métrica utilizável (${periodLabel}).`;

  const limitations: string[] = [];
  if (recentPosts.length > 0 && comparablePosts.length < 4) {
    limitations.push("Amostra pequena (< 4 posts): trate variações como sinais iniciais, não como padrão definitivo.");
  }
  if (selectedPage === "all") {
    limitations.push("Na visão consolidada, destaques misturam contas diferentes; valide cada sinal na conta específica.");
  }

  // Recomendações com evidência, explicação e ação executável
  const recommendations: ActionableRecommendation[] = [];
  if (selectedPage !== "all" && (!strategy || !strategy.primary_objective.trim())) {
    recommendations.push({
      id: `rec-strategy-${selectedPage}`,
      pageId: selectedPage,
      accountName,
      title: `Definir estratégia editorial base de ${accountName}`,
      evidence: "Objetivo principal e pilares editoriais ainda não estão preenchidos.",
      explanation: "Sem estratégia salva para a conta, ideias, roteiros e prioridades ficam genéricos.",
      actionLabel: "Preencher Estratégia da conta",
      priority: "alta",
      evidencePostIds: [],
      targetRoute: "/social-estrategia",
    });
  }
  if (overdueTasks.length > 0) {
    recommendations.push({
      id: `rec-overdue-${selectedPage}`,
      pageId: selectedPage,
      accountName,
      title: `Resolver ${overdueTasks.length} tarefa(s) vencida(s) no fluxo Social`,
      evidence: `${overdueTasks.length} pendência(s) com prazo vencido.`,
      explanation: "Pendências atrasadas travam aprovação e agendamento da semana.",
      actionLabel: "Revisar tarefas atrasadas",
      priority: "urgente",
      evidencePostIds: [],
      targetRoute: "/social-conteudo",
    });
  }
  if (awaitingApprovalContent.length > 0) {
    recommendations.push({
      id: `rec-approval-${selectedPage}`,
      pageId: selectedPage,
      accountName,
      title: `Destravar ${awaitingApprovalContent.length} item(ns) aguardando revisão/aprovação`,
      evidence: `${awaitingApprovalContent.length} conteúdo(s) parado(s) em revisão interna ou aprovação do cliente.`,
      explanation: "Aprovar dentro do prazo evita correria antes do agendamento.",
      actionLabel: "Abrir fila de aprovação",
      priority: "alta",
      evidencePostIds: [],
      targetRoute: "/social-conteudo",
    });
  }
  if (pillarGaps.length > 0 && selectedPage !== "all") {
    recommendations.push({
      id: `rec-pillar-gap-${selectedPage}`,
      pageId: selectedPage,
      accountName,
      title: `Criar pauta para pilar descoberto: ${pillarGaps[0]}`,
      evidence: `${pillarGaps.length} pilar(es) cadastrado(s) na estratégia sem nenhum conteúdo ativo: ${pillarGaps.join(", ")}.`,
      explanation: "Cobrir todos os pilares definidos evita repetição de tema na conta.",
      actionLabel: "Gerar ideia para este pilar",
      priority: "media",
      evidencePostIds: [],
      targetRoute: "/social-conteudo",
    });
  }
  if (highlights[0]) {
    recommendations.push({
      id: `rec-repeat-winner-${highlights[0].postId}`,
      pageId: selectedPage,
      accountName: highlights[0].accountName,
      title: `Replicar ângulo do melhor post recente (${highlights[0].relativeScoreLabel})`,
      evidence: `${highlights[0].metricSummary} em "${highlights[0].captionExcerpt}".`,
      explanation: "Publicação superou a mediana recente da própria amostra; vale criar uma variação para testar consistência.",
      actionLabel: "Testar variação em roteiro",
      priority: "media",
      evidencePostIds: [highlights[0].postId],
      targetRoute: "/social-testes",
    });
  }

  return {
    todayPriorities: {
      overdueTasks,
      dueSoonTasks,
      awaitingApprovalContent,
      scheduledTodayOrSoon,
      pendingByMember,
    },
    weekSummary: {
      days,
      stageCounts,
      pillarCoverage,
      pillarGaps,
      cadenceNote,
    },
    performanceSignals: {
      highlights,
      coverageText,
      limitations,
      recommendations,
    },
    nextRecommendedAction: recommendations[0] || null,
  };
}

// ============================================================================
// 8. EXPERIMENTOS ORGÂNICOS & BANCO DE APRENDIZADOS (GUARDRAILS)
// ============================================================================

export type ExperimentStatus = "planned" | "running" | "concluded" | "inconclusive" | "cancelled";
export type ExperimentConclusionStatus =
  | "pending"
  | "validated"
  | "refuted"
  | "inconclusive"
  | "insufficient_sample";

export interface SocialExperiment {
  id: string;
  page_id: string;
  client_id?: string | null;
  account_name: string;
  title: string;
  hypothesis: string;
  primary_variable: string;
  variants: string[];
  audience_context: string;
  format: string;
  objective: string;
  primary_metric: string;
  window_start?: string | null;
  window_end?: string | null;
  closure_criteria: string;
  status: ExperimentStatus;
  is_manual_meta_native: boolean;
  sample_count: number;
  observed_result_summary: string;
  sample_notes: string;
  conclusion_status: ExperimentConclusionStatus;
  learning_notes: string;
  next_action: string;
  linked_content_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SocialLearningRecord {
  id: string;
  page_id: string;
  client_id?: string | null;
  account_name: string;
  title: string;
  category: string;
  observation: string;
  evidence_summary: string;
  evidence_post_ids: string[];
  period_label: string;
  sample_coverage: string;
  ai_generated: boolean;
  validation_status: "pending" | "confirmed" | "corrected" | "rejected";
  human_correction?: string | null;
  actionable_next_step: string;
  linked_experiment_id?: string | null;
  created_at: string;
  updated_at: string;
}

export function validateExperimentConclusion(params: {
  conclusionStatus: ExperimentConclusionStatus;
  sampleCount: number;
  primaryVariable: string;
  closureCriteria: string;
  minimumDirectionalSample?: number;
}): { allowed: boolean; normalizedStatus: ExperimentConclusionStatus; warning: string | null } {
  const minSample = params.minimumDirectionalSample ?? 4;
  if (!params.primaryVariable.trim() || !params.closureCriteria.trim()) {
    return {
      allowed: false,
      normalizedStatus: "inconclusive",
      warning: "Defina a variável principal e o critério de encerramento antes de concluir o teste.",
    };
  }
  if (
    (params.conclusionStatus === "validated" || params.conclusionStatus === "refuted") &&
    params.sampleCount < minSample
  ) {
    return {
      allowed: false,
      normalizedStatus: "insufficient_sample",
      warning: `Amostra insuficiente (${params.sampleCount} de mínimo ${minSample} publicações/leituras). Em orgânico, não declare vencedor com amostra baixa.`,
    };
  }
  return {
    allowed: true,
    normalizedStatus: params.conclusionStatus,
    warning:
      "Leitura direcional registrada: testes orgânicos não isolam 100% variáveis externas de algoritmo.",
  };
}
