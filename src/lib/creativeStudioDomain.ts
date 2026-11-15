export type StudioFormatId = "1:1" | "4:5" | "9:16" | "16:9";

export type StudioCreationModeId =
  | "faithful_composition"
  | "ai_scenario"
  | "ai_generated_art"
  | "smart_variations";

export type StudioPieceObjective =
  | "mensagens_whatsapp"
  | "trafego_site"
  | "alcance_marca"
  | "visitas_perfil"
  | "geracao_cadastros"
  | "vendas_catalogo";

export type StudioTemplateCategory =
  | "oferta_preco"
  | "abaixo_fipe"
  | "feirao_urgencia"
  | "parcelas_entrada"
  | "troca_seminovo"
  | "premium_executivo"
  | "queima_estoque"
  | "prova_social"
  | "diferenciais"
  | "institucional"
  | "aluguel_motos"
  | "motos"
  | "protecao_veicular"
  | "servico_local";

export type StudioExportFormat = "image/png" | "image/jpeg" | "image/webp";

export interface StudioSafeAreaSpec {
  topPct: number;
  bottomPct: number;
  leftPct: number;
  rightPct: number;
  label: string;
}

export interface StudioFormatSpec {
  id: StudioFormatId;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  apiAspect: "1:1" | "4:5" | "9:16" | "16:9";
  apiSize: "1024x1024" | "1024x1792" | "1792x1024";
  placementHint: string;
  safeArea: StudioSafeAreaSpec;
}

export const STUDIO_FORMATS: StudioFormatSpec[] = [
  {
    id: "1:1",
    label: "Feed 1:1 (1080×1080)",
    shortLabel: "Feed 1:1",
    width: 1080,
    height: 1080,
    apiAspect: "1:1",
    apiSize: "1024x1024",
    placementHint: "Feed Instagram & Facebook quadrado",
    safeArea: {
      topPct: 0.06,
      bottomPct: 0.06,
      leftPct: 0.06,
      rightPct: 0.06,
      label: "Margem de segurança Feed 1:1 (6% em cada borda)",
    },
  },
  {
    id: "4:5",
    label: "Feed 4:5 (1080×1350)",
    shortLabel: "Feed 4:5",
    width: 1080,
    height: 1350,
    apiAspect: "4:5",
    apiSize: "1024x1792",
    placementHint: "Feed vertical com maior área de tela",
    safeArea: {
      topPct: 0.06,
      bottomPct: 0.08,
      leftPct: 0.06,
      rightPct: 0.06,
      label: "Margem de segurança Feed 4:5 (6% topo, 8% rodapé)",
    },
  },
  {
    id: "9:16",
    label: "Stories/Reels 9:16 (1080×1920)",
    shortLabel: "Stories/Reels 9:16",
    width: 1080,
    height: 1920,
    apiAspect: "9:16",
    apiSize: "1024x1792",
    placementHint: "Stories & Reels em tela cheia",
    safeArea: {
      topPct: 0.14,
      bottomPct: 0.2,
      leftPct: 0.07,
      rightPct: 0.07,
      label: "Zona segura Stories/Reels (protege 14% topo do perfil e 20% rodapé de CTA/legenda)",
    },
  },
  {
    id: "16:9",
    label: "Horizontal 16:9 (1920×1080)",
    shortLabel: "Horizontal 16:9",
    width: 1920,
    height: 1080,
    apiAspect: "16:9",
    apiSize: "1792x1024",
    placementHint: "Landscape, YouTube, banners e Audience Network",
    safeArea: {
      topPct: 0.07,
      bottomPct: 0.07,
      leftPct: 0.06,
      rightPct: 0.06,
      label: "Margem de segurança Horizontal 16:9",
    },
  },
];

export interface StudioCreationModeSpec {
  id: StudioCreationModeId;
  code: "A" | "B" | "C" | "D";
  label: string;
  shortLabel: string;
  description: string;
  usesPaidAi: boolean;
  preservesRealSubject: boolean;
  requiresUserCostConfirmation: boolean;
  estimatedCostLabel: string;
  fidelityNotice: string | null;
}

export const STUDIO_CREATION_MODES: StudioCreationModeSpec[] = [
  {
    id: "faithful_composition",
    code: "A",
    label: "A. Composição fiel",
    shortLabel: "Composição fiel",
    description:
      "Usa 100% a foto real enviada do veículo/produto com camadas determinísticas, identidade do Brand Kit e layout editável, sem alterar o objeto real.",
    usesPaidAi: false,
    preservesRealSubject: true,
    requiresUserCostConfirmation: false,
    estimatedCostLabel: "Sem custo de API de geração de imagem",
    fidelityNotice: null,
  },
  {
    id: "ai_scenario",
    code: "B",
    label: "B. Cenário com IA",
    shortLabel: "Cenário com IA",
    description:
      "Mantém a foto real enviada em primeiro plano e gera um fundo/estúdio automotivo limpo via DALL-E 3 para comparação Antes/Depois.",
    usesPaidAi: true,
    preservesRealSubject: true,
    requiresUserCostConfirmation: true,
    estimatedCostLabel: "Consome 1 chamada DALL-E 3 HD (custo por imagem na chave OpenAI)",
    fidelityNotice:
      "A foto real enviada permanece visível como referência principal, enquanto o cenário ao redor é gerado por IA. Revise o Antes/Depois antes de exportar.",
  },
  {
    id: "ai_generated_art",
    code: "C",
    label: "C. Arte gerada por IA",
    shortLabel: "Arte gerada por IA",
    description:
      "Gera um visual publicitário ilustrativo a partir do briefing, sem texto embutido na imagem da IA; headline, preço e CTA ficam nas camadas editáveis.",
    usesPaidAi: true,
    preservesRealSubject: false,
    requiresUserCostConfirmation: true,
    estimatedCostLabel: "Consome 1 chamada DALL-E 3 HD (custo por imagem na chave OpenAI)",
    fidelityNotice:
      "AVISO DE FIDELIDADE: A imagem gerada por IA é ilustrativa e NÃO representa uma foto real do estoque — modelos, cores e detalhes visuais podem ser inventados pela IA.",
  },
  {
    id: "smart_variations",
    code: "D",
    label: "D. Variações inteligentes",
    shortLabel: "Variações inteligentes",
    description:
      "Gera múltiplas combinações de gancho, hierarquia visual e CTA a partir dos MESMOS fatos comerciais confirmados, sem inventar preços ou condições.",
    usesPaidAi: false,
    preservesRealSubject: true,
    requiresUserCostConfirmation: false,
    estimatedCostLabel: "Geração local instantânea sem custo de API de imagem",
    fidelityNotice:
      "Todas as variações usam exclusivamente os fatos confirmados no briefing comercial. Nenhuma condição numérica adicional é criada.",
  },
];

export const STUDIO_PIECE_OBJECTIVES: Array<{
  id: StudioPieceObjective;
  label: string;
  metaObjectives: string[];
  compatibleResultUnits: string[];
  defaultCta: string;
  recommendedChannel: string;
}> = [
  {
    id: "mensagens_whatsapp",
    label: "Mensagens / Conversas (WhatsApp / Direct)",
    metaObjectives: ["MESSAGES", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS"],
    compatibleResultUnits: ["conversations", "leads"],
    defaultCta: "CHAMAR NO WHATSAPP",
    recommendedChannel: "WhatsApp Direct",
  },
  {
    id: "trafego_site",
    label: "Tráfego / Cliques e Visitas ao Site",
    metaObjectives: ["LINK_CLICKS", "OUTCOME_TRAFFIC"],
    compatibleResultUnits: ["landing_page_views", "link_clicks"],
    defaultCta: "VER ESTOQUE NO SITE",
    recommendedChannel: "Site / Estoque",
  },
  {
    id: "alcance_marca",
    label: "Alcance / Reconhecimento Local",
    metaObjectives: ["REACH", "OUTCOME_AWARENESS", "BRAND_AWARENESS"],
    compatibleResultUnits: ["reach", "impressions"],
    defaultCta: "CONHECER A LOJA",
    recommendedChannel: "Feed & Stories Local",
  },
  {
    id: "visitas_perfil",
    label: "Visitas ao Perfil Instagram",
    metaObjectives: ["OUTCOME_TRAFFIC", "PROFILE_VISITS", "OUTCOME_ENGAGEMENT"],
    compatibleResultUnits: ["profile_visits", "link_clicks"],
    defaultCta: "VISITAR PERFIL",
    recommendedChannel: "Instagram Profile",
  },
  {
    id: "geracao_cadastros",
    label: "Geração de Cadastros / Simulação",
    metaObjectives: ["LEAD_GENERATION", "OUTCOME_LEADS"],
    compatibleResultUnits: ["leads"],
    defaultCta: "SIMULAR FINANCIAMENTO",
    recommendedChannel: "Formulário Nativo Meta",
  },
  {
    id: "vendas_catalogo",
    label: "Vendas / Conversões em Catálogo",
    metaObjectives: ["CONVERSIONS", "OUTCOME_SALES", "PRODUCT_CATALOG_SALES"],
    compatibleResultUnits: ["purchases", "sales"],
    defaultCta: "COMPRAR AGORA",
    recommendedChannel: "Catálogo / Checkout",
  },
];

export interface StudioTemplateSpec {
  id: string;
  category: StudioTemplateCategory;
  categoryLabel: string;
  name: string;
  badgeText: string;
  suggestedHook: string;
  accentStyle: "bold_banner" | "dark_luxury" | "urgent_ribbon" | "clean_card" | "split_grid";
  visualSummary: string;
  gradientColors: [string, string];
  usesBrandKitAccent: boolean;
  overlayOpacity: number;
}

export const STUDIO_TEMPLATES: StudioTemplateSpec[] = [
  {
    id: "promo",
    category: "oferta_preco",
    categoryLabel: "Oferta / Preço",
    name: "Oferta Direta & Condição Real",
    badgeText: "CONDIÇÃO ESPECIAL",
    suggestedHook: "Valor e condições transparentes direto na chamada principal.",
    accentStyle: "bold_banner",
    visualSummary: "Faixa inferior contrastada + selo superior para destacar oferta confirmada.",
    gradientColors: ["#18181b", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.78,
  },
  {
    id: "abaixo_fipe",
    category: "abaixo_fipe",
    categoryLabel: "Abaixo da FIPE",
    name: "Oportunidade Abaixo da FIPE",
    badgeText: "COMPARATIVO FIPE",
    suggestedHook: "Destaca diferença confirmada em relação à tabela FIPE sem exageros.",
    accentStyle: "urgent_ribbon",
    visualSummary: "Selo de oportunidade no topo e bloco inferior para comparativo FIPE confirmado.",
    gradientColors: ["#0f172a", "#020617"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.76,
  },
  {
    id: "feirao",
    category: "feirao_urgencia",
    categoryLabel: "Feirão / Urgência",
    name: "Feirão & Oportunidade por Tempo Limitado",
    badgeText: "FEIRÃO DE OFERTAS",
    suggestedHook: "Chamada de oportunidade imediata para campanha promocional.",
    accentStyle: "urgent_ribbon",
    visualSummary: "Gradiente de alto contraste com selo angular e CTA de resposta rápida.",
    gradientColors: ["#2b0909", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.8,
  },
  {
    id: "parcela",
    category: "parcelas_entrada",
    categoryLabel: "Parcelas / Entrada",
    name: "Condição de Financiamento Confirmada",
    badgeText: "CONDIÇÃO DE PARCELA",
    suggestedHook: "Enfatiza entrada e parcela confirmadas pelo lojista.",
    accentStyle: "clean_card",
    visualSummary: "Cartão estruturado inferior para destacar entrada + parcela confirmada.",
    gradientColors: ["#06221b", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.75,
  },
  {
    id: "troca",
    category: "troca_seminovo",
    categoryLabel: "Troca / Seminovo",
    name: "Seu Usado na Troca",
    badgeText: "AVALIAÇÃO DE TROCA",
    suggestedHook: "Convida o comprador a enviar fotos/dados do veículo atual.",
    accentStyle: "split_grid",
    visualSummary: "Composição equilibrada com foco no atendimento consultivo e avaliação.",
    gradientColors: ["#0b1b36", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.74,
  },
  {
    id: "vip",
    category: "premium_executivo",
    categoryLabel: "Premium / Executivo",
    name: "Vitrine Executiva & Padrão Concessionária",
    badgeText: "SELEÇÃO PREMIUM",
    suggestedHook: "Estética sóbria e espaçada para veículos de ticket mais alto.",
    accentStyle: "dark_luxury",
    visualSummary: "Moldura escura refinada, tipografia limpa e baixo ruído visual.",
    gradientColors: ["#111111", "#050505"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.7,
  },
  {
    id: "queima_estoque",
    category: "queima_estoque",
    categoryLabel: "Estoque / Giro Rápido",
    name: "Giro de Estoque / Últimas Unidades",
    badgeText: "OPORTUNIDADE DE ESTOQUE",
    suggestedHook: "Ideal para carros e motos parados ou campanhas de renovação.",
    accentStyle: "bold_banner",
    visualSummary: "Bloco inferior sólido que preserva 65% da foto do veículo limpa.",
    gradientColors: ["#1f1206", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.78,
  },
  {
    id: "prova_social",
    category: "prova_social",
    categoryLabel: "Prova Social / Entrega",
    name: "Entrega Real & Cliente Satisfeito",
    badgeText: "ENTREGA REALIZADA",
    suggestedHook: "Mostra transparência e recorrência de entregas reais na loja.",
    accentStyle: "clean_card",
    visualSummary: "Enquadramento pensado para foto de entrega + assinatura da loja.",
    gradientColors: ["#0d2318", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.68,
  },
  {
    id: "diferenciais",
    category: "diferenciais",
    categoryLabel: "Características & Diferenciais",
    name: "Ficha Técnica & Diferenciais Confirmados",
    badgeText: "DETALHES REAIS",
    suggestedHook: "Destaca versão, motor, câmbio ou itens reais sem enfeite.",
    accentStyle: "split_grid",
    visualSummary: "Selo técnico + linha de especificações confirmadas abaixo da headline.",
    gradientColors: ["#111827", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.74,
  },
  {
    id: "brand",
    category: "institucional",
    categoryLabel: "Institucional / Alcance",
    name: "Marca, Confiança & Presença Local",
    badgeText: "CONFIANÇA & PROCEDÊNCIA",
    suggestedHook: "Peça para alcance, reconhecimento e memória de marca da loja.",
    accentStyle: "dark_luxury",
    visualSummary: "Logo, paleta da conta e mensagem institucional sem apelo agressivo.",
    gradientColors: ["#18181b", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.65,
  },
  {
    id: "aluguel_motos",
    category: "aluguel_motos",
    categoryLabel: "Aluguel de Motos",
    name: "Locação de Motos para Trabalho ou Dia a Dia",
    badgeText: "LOCAÇÃO DE MOTOS",
    suggestedHook: "Comunica plano semanal/mensal confirmado e retirada rápida.",
    accentStyle: "bold_banner",
    visualSummary: "Contraste forte com espaço dedicado ao plano confirmado e requisitos reais.",
    gradientColors: ["#1c1917", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.78,
  },
  {
    id: "motos",
    category: "motos",
    categoryLabel: "Motos",
    name: "Showroom 2 Rodas / Motocicletas",
    badgeText: "SHOWROOM MOTOS",
    suggestedHook: "Foco na moto, cilindrada confirmada e condição direta com a equipe.",
    accentStyle: "urgent_ribbon",
    visualSummary: "Layout dinâmico para motos novas e seminovas com CTA direto.",
    gradientColors: ["#171717", "#050505"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.74,
  },
  {
    id: "protecao_veicular",
    category: "protecao_veicular",
    categoryLabel: "Proteção Veicular",
    name: "Proteção Veicular & Assistência",
    badgeText: "PROTEÇÃO VEICULAR",
    suggestedHook: "Comunica coberturas reais confirmadas e cotação rápida sem exageros.",
    accentStyle: "clean_card",
    visualSummary: "Layout confiável com clareza de benefícios e chamada para cotação.",
    gradientColors: ["#082032", "#040d16"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.75,
  },
  {
    id: "servico_local",
    category: "servico_local",
    categoryLabel: "Serviço / Negócio Local",
    name: "Serviço Local, Estética ou Oficina",
    badgeText: "ATENDIMENTO LOCAL",
    suggestedHook: "Destaca especialidade local, agendamento e localização real.",
    accentStyle: "clean_card",
    visualSummary: "Composição limpa para serviços automotivos e negócios locais.",
    gradientColors: ["#132028", "#09090b"],
    usesBrandKitAccent: true,
    overlayOpacity: 0.72,
  },
];

export interface ConfirmedCommercialFacts {
  pieceObjective: StudioPieceObjective;
  channelDestination: string;
  vehicleOrOfferName: string;
  headlineOffer: string;
  confirmedPrice: string;
  confirmedInstallment: string;
  confirmedDownPayment: string;
  fipeComparison: string;
  confirmedDifferentials: string;
  confirmedCondition: string;
  confirmedCta: string;
  confirmedLocationOrContact: string;
}

export interface BrandKitLike {
  id?: string;
  ad_account_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  tone_of_voice?: string | null;
  brand_rules?: string | null;
  restrictions?: string | null;
  reference_urls?: string[] | null;
}

export type StudioLayerKind = "badge" | "headline" | "subheadline" | "price" | "specs" | "cta" | "shape";

export interface StudioLayer {
  id: string;
  kind: StudioLayerKind;
  label: string;
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  fontSizePx: number;
  fontWeight: "600" | "700" | "800" | "900";
  align: "left" | "center" | "right";
  color: string;
  backgroundColor: string | null;
  backgroundOpacity: number;
  borderRadiusPx: number;
  shadow: boolean;
  visible: boolean;
  zIndex: number;
}

export interface StudioBackgroundTransform {
  zoom: number;
  offsetXPct: number;
  offsetYPct: number;
  cropMode: "cover" | "contain";
  overlayOpacity: number;
}

export interface StudioVariationOption {
  id: string;
  angleTitle: string;
  hookRationale: string;
  badgeText: string;
  headlineText: string;
  subheadlineText: string;
  priceText: string;
  ctaText: string;
  confirmedFactsOnly: true;
}

export function getStudioFormatSpec(formatId: StudioFormatId): StudioFormatSpec {
  return STUDIO_FORMATS.find((f) => f.id === formatId) ?? STUDIO_FORMATS[0];
}

export function getStudioTemplateSpec(templateId: string): StudioTemplateSpec {
  return STUDIO_TEMPLATES.find((t) => t.id === templateId) ?? STUDIO_TEMPLATES[0];
}

export function resolveStudioAccountContext(input: {
  selectedAccountId: string;
  explicitStudioAccountId?: string;
  seedAdAccountId?: string | null;
  accounts: Array<{ id: string; name?: string | null }>;
}): {
  effectiveAccountId: string;
  requiresExplicitAccountSelection: boolean;
  accountName: string | null;
} {
  if (input.seedAdAccountId) {
    const found = input.accounts.find((a) => a.id === input.seedAdAccountId);
    return {
      effectiveAccountId: input.seedAdAccountId,
      requiresExplicitAccountSelection: false,
      accountName: found?.name ?? input.seedAdAccountId,
    };
  }

  if (input.explicitStudioAccountId) {
    const found = input.accounts.find((a) => a.id === input.explicitStudioAccountId);
    return {
      effectiveAccountId: input.explicitStudioAccountId,
      requiresExplicitAccountSelection: false,
      accountName: found?.name ?? input.explicitStudioAccountId,
    };
  }

  if (input.selectedAccountId && input.selectedAccountId !== "all") {
    const found = input.accounts.find((a) => a.id === input.selectedAccountId);
    return {
      effectiveAccountId: input.selectedAccountId,
      requiresExplicitAccountSelection: false,
      accountName: found?.name ?? input.selectedAccountId,
    };
  }

  // Regra estrita: com "Todas as Contas" ativo, NUNCA pré-selecionar accounts[0]
  return {
    effectiveAccountId: "",
    requiresExplicitAccountSelection: true,
    accountName: null,
  };
}

export function evaluateBrandKitHealth(
  brandKit: BrandKitLike | null | undefined,
  accountName?: string | null
): {
  hasBrandKit: boolean;
  hasLogo: boolean;
  statusLabel: string;
  warningMessage: string | null;
  canContinueWithoutBrandKit: boolean;
} {
  if (!brandKit) {
    return {
      hasBrandKit: false,
      hasLogo: false,
      statusLabel: "Sem Brand Kit configurado",
      warningMessage: accountName
        ? `A conta "${accountName}" ainda não possui Brand Kit salvo. Você pode continuar editando sem marca inventada ou configurar cores e logo no painel da conta.`
        : "Selecione uma conta para carregar o Brand Kit específico da marca.",
      canContinueWithoutBrandKit: true,
    };
  }

  const hasLogo = Boolean(brandKit.logo_url && brandKit.logo_url.trim().length > 0);
  if (!hasLogo) {
    return {
      hasBrandKit: true,
      hasLogo: false,
      statusLabel: "Brand Kit ativo sem logo",
      warningMessage:
        "Brand Kit encontrado, mas sem logo cadastrado. Nenhuma marca substituta será aplicada; adicione o logo da loja se desejar exibi-lo na peça.",
      canContinueWithoutBrandKit: true,
    };
  }

  return {
    hasBrandKit: true,
    hasLogo: true,
    statusLabel: "Brand Kit completo com logo",
    warningMessage: null,
    canContinueWithoutBrandKit: true,
  };
}

export function buildConfirmedCommercialLines(facts: ConfirmedCommercialFacts): {
  headline: string;
  subheadline: string;
  priceLine: string;
  specsLine: string;
  cta: string;
  confirmedSummary: string[];
} {
  const headline =
    facts.headlineOffer.trim() || facts.vehicleOrOfferName.trim() || "Defina a chamada confirmada";

  const priceParts = [
    facts.confirmedPrice.trim(),
    facts.confirmedInstallment.trim(),
    facts.confirmedDownPayment.trim(),
    facts.fipeComparison.trim(),
  ].filter(Boolean);

  const subheadlineParts = [
    facts.vehicleOrOfferName.trim() && facts.headlineOffer.trim()
      ? facts.vehicleOrOfferName.trim()
      : "",
    facts.confirmedCondition.trim(),
    facts.confirmedLocationOrContact.trim(),
  ].filter(Boolean);

  const objSpec =
    STUDIO_PIECE_OBJECTIVES.find((o) => o.id === facts.pieceObjective) ??
    STUDIO_PIECE_OBJECTIVES[0];

  const cta = facts.confirmedCta.trim() || objSpec.defaultCta;
  const priceLine = priceParts.join(" • ");
  const specsLine = facts.confirmedDifferentials.trim();
  const subheadline = subheadlineParts.join(" | ");

  const confirmedSummary = [
    facts.vehicleOrOfferName.trim() ? `Oferta/Veículo: ${facts.vehicleOrOfferName.trim()}` : "",
    facts.confirmedPrice.trim() ? `Preço: ${facts.confirmedPrice.trim()}` : "",
    facts.confirmedDownPayment.trim() ? `Entrada: ${facts.confirmedDownPayment.trim()}` : "",
    facts.confirmedInstallment.trim() ? `Parcela: ${facts.confirmedInstallment.trim()}` : "",
    facts.fipeComparison.trim() ? `FIPE: ${facts.fipeComparison.trim()}` : "",
    facts.confirmedDifferentials.trim()
      ? `Diferenciais: ${facts.confirmedDifferentials.trim()}`
      : "",
    facts.confirmedCondition.trim() ? `Condições: ${facts.confirmedCondition.trim()}` : "",
  ].filter(Boolean);

  return { headline, subheadline, priceLine, specsLine, cta, confirmedSummary };
}

export function createInitialStudioLayers(input: {
  template: StudioTemplateSpec;
  brandKit?: BrandKitLike | null;
  facts: ConfirmedCommercialFacts;
  formatId: StudioFormatId;
}): StudioLayer[] {
  const accent = input.brandKit?.accent_color || "#E11D48";
  const primary = input.brandKit?.primary_color || "#18181b";
  const secondary = input.brandKit?.secondary_color || "#FAFAFA";
  const confirmed = buildConfirmedCommercialLines(input.facts);
  const spec = getStudioFormatSpec(input.formatId);

  const topSafePct = Math.round((spec.safeArea.topPct + 0.03) * 100);
  const bottomSafeEndPct = Math.round((1 - spec.safeArea.bottomPct - 0.02) * 100);
  const leftMarginPct = Math.round((spec.safeArea.leftPct + 0.02) * 100);
  const contentWidthPct = 100 - leftMarginPct * 2;
  const isTall = input.formatId === "9:16";
  const isWide = input.formatId === "16:9";

  return [
    {
      id: "layer-badge",
      kind: "badge",
      label: "Selo Superior",
      text: input.template.badgeText,
      xPct: leftMarginPct,
      yPct: topSafePct,
      widthPct: isWide ? 34 : 58,
      fontSizePx: isWide ? 24 : 26,
      fontWeight: "900",
      align: "center",
      color: "#FFFFFF",
      backgroundColor: accent,
      backgroundOpacity: 0.95,
      borderRadiusPx: 14,
      shadow: true,
      visible: true,
      zIndex: 10,
    },
    {
      id: "layer-headline",
      kind: "headline",
      label: "Headline Principal",
      text: confirmed.headline,
      xPct: leftMarginPct,
      yPct: isTall ? bottomSafeEndPct - 31 : bottomSafeEndPct - 34,
      widthPct: contentWidthPct,
      fontSizePx: isWide ? 54 : isTall ? 56 : 58,
      fontWeight: "900",
      align: "left",
      color: secondary,
      backgroundColor: null,
      backgroundOpacity: 0,
      borderRadiusPx: 0,
      shadow: true,
      visible: true,
      zIndex: 20,
    },
    {
      id: "layer-price",
      kind: "price",
      label: "Preço / Condição Confirmada",
      text: confirmed.priceLine,
      xPct: leftMarginPct,
      yPct: isTall ? bottomSafeEndPct - 20 : bottomSafeEndPct - 21,
      widthPct: contentWidthPct,
      fontSizePx: isWide ? 36 : 38,
      fontWeight: "800",
      align: "left",
      color: accent,
      backgroundColor: primary,
      backgroundOpacity: confirmed.priceLine ? 0.85 : 0,
      borderRadiusPx: 12,
      shadow: true,
      visible: Boolean(confirmed.priceLine),
      zIndex: 25,
    },
    {
      id: "layer-subheadline",
      kind: "subheadline",
      label: "Subtítulo / Condição",
      text: confirmed.subheadline,
      xPct: leftMarginPct,
      yPct: bottomSafeEndPct - 13,
      widthPct: contentWidthPct,
      fontSizePx: 27,
      fontWeight: "600",
      align: "left",
      color: "#E4E4E7",
      backgroundColor: null,
      backgroundOpacity: 0,
      borderRadiusPx: 0,
      shadow: true,
      visible: Boolean(confirmed.subheadline),
      zIndex: 30,
    },
    {
      id: "layer-specs",
      kind: "specs",
      label: "Diferenciais Confirmados",
      text: confirmed.specsLine,
      xPct: leftMarginPct,
      yPct: isTall ? bottomSafeEndPct - 39 : topSafePct + 9,
      widthPct: contentWidthPct,
      fontSizePx: 22,
      fontWeight: "600",
      align: "left",
      color: "#F4F4F5",
      backgroundColor: "#09090B",
      backgroundOpacity: confirmed.specsLine ? 0.6 : 0,
      borderRadiusPx: 10,
      shadow: false,
      visible: Boolean(confirmed.specsLine),
      zIndex: 15,
    },
    {
      id: "layer-cta",
      kind: "cta",
      label: "Botão CTA",
      text: confirmed.cta,
      xPct: leftMarginPct,
      yPct: bottomSafeEndPct - 7,
      widthPct: isWide ? 42 : 76,
      fontSizePx: 26,
      fontWeight: "900",
      align: "center",
      color: "#FFFFFF",
      backgroundColor: accent,
      backgroundOpacity: 1,
      borderRadiusPx: 14,
      shadow: true,
      visible: Boolean(confirmed.cta),
      zIndex: 40,
    },
  ];
}

export function generateSmartVariations(input: {
  facts: ConfirmedCommercialFacts;
  template: StudioTemplateSpec;
}): StudioVariationOption[] {
  const base = buildConfirmedCommercialLines(input.facts);
  const subject = input.facts.vehicleOrOfferName.trim() || base.headline;
  const priceLineOnly = base.priceLine || "";
  const diffs = input.facts.confirmedDifferentials.trim();
  const location = input.facts.confirmedLocationOrContact.trim();

  return [
    {
      id: "var-direct",
      angleTitle: "1. Clareza Direta da Oferta",
      hookRationale: "Prioriza o produto/veículo e os valores confirmados logo na primeira leitura.",
      badgeText: input.template.badgeText,
      headlineText: base.headline,
      subheadlineText: [location, input.facts.confirmedCondition.trim()].filter(Boolean).join(" • "),
      priceText: priceLineOnly,
      ctaText: base.cta,
      confirmedFactsOnly: true,
    },
    {
      id: "var-specs",
      angleTitle: "2. Foco em Diferenciais & Procedência",
      hookRationale: "Destaca atributos reais do anúncio antes da chamada de contato.",
      badgeText: "DESTAQUE REAL",
      headlineText: subject,
      subheadlineText: diffs || base.subheadline,
      priceText: priceLineOnly,
      ctaText: base.cta,
      confirmedFactsOnly: true,
    },
    {
      id: "var-consultation",
      angleTitle: "3. Atendimento Consultivo / Troca",
      hookRationale: "Convida o lead qualificado a iniciar conversa com a equipe sobre a condição.",
      badgeText: "ATENDIMENTO DIRETO",
      headlineText: subject,
      subheadlineText: [input.facts.confirmedCondition.trim(), diffs, location]
        .filter(Boolean)
        .join(" • "),
      priceText: priceLineOnly,
      ctaText: input.facts.confirmedCta.trim() || "FALAR COM CONSULTOR",
      confirmedFactsOnly: true,
    },
    {
      id: "var-channel",
      angleTitle: "4. Chamada Orientada ao Destino",
      hookRationale: `Ajusta a hierarquia para o canal "${input.facts.channelDestination || "Meta Ads"}".`,
      badgeText: input.template.categoryLabel.toUpperCase(),
      headlineText: base.headline,
      subheadlineText: [diffs, location].filter(Boolean).join(" • "),
      priceText: priceLineOnly,
      ctaText: base.cta,
      confirmedFactsOnly: true,
    },
  ];
}

export function detectOutOfSafeZoneLayers(
  layers: StudioLayer[],
  formatId: StudioFormatId
): Array<{ layerId: string; layerLabel: string; reasons: string[] }> {
  const spec = getStudioFormatSpec(formatId);
  const topMin = spec.safeArea.topPct * 100;
  const bottomMax = (1 - spec.safeArea.bottomPct) * 100;
  const leftMin = spec.safeArea.leftPct * 100;
  const rightMax = (1 - spec.safeArea.rightPct) * 100;

  const warnings: Array<{ layerId: string; layerLabel: string; reasons: string[] }> = [];

  for (const layer of layers) {
    if (!layer.visible || !layer.text.trim()) continue;
    const reasons: string[] = [];
    const layerHeightApproxPct = layer.kind === "headline" ? 9 : layer.kind === "price" ? 7 : 5.5;
    if (layer.yPct < topMin) {
      reasons.push(`Topo em ${layer.yPct.toFixed(0)}% invade área superior (< ${topMin.toFixed(0)}%)`);
    }
    if (layer.yPct + layerHeightApproxPct > bottomMax) {
      reasons.push(
        `Base estimada (${(layer.yPct + layerHeightApproxPct).toFixed(0)}%) invade área inferior (> ${bottomMax.toFixed(0)}%)`
      );
    }
    if (layer.xPct < leftMin) {
      reasons.push(`Esquerda em ${layer.xPct.toFixed(0)}% invade margem (< ${leftMin.toFixed(0)}%)`);
    }
    if (layer.xPct + layer.widthPct > rightMax + 0.5) {
      reasons.push(
        `Largura ultrapassa margem direita (${(layer.xPct + layer.widthPct).toFixed(0)}% > ${rightMax.toFixed(0)}%)`
      );
    }
    if (reasons.length > 0) {
      warnings.push({
        layerId: layer.id,
        layerLabel: layer.label,
        reasons,
      });
    }
  }

  return warnings;
}

export function adaptStudioLayersToFormat(input: {
  sourceLayers: StudioLayer[];
  sourceFormatId: StudioFormatId;
  targetFormatId: StudioFormatId;
}): {
  layers: StudioLayer[];
  cropLossRatio: number;
  requiresCropConfirmation: boolean;
  cropWarningMessage: string | null;
} {
  const sourceSpec = getStudioFormatSpec(input.sourceFormatId);
  const targetSpec = getStudioFormatSpec(input.targetFormatId);

  const sourceRatio = sourceSpec.width / sourceSpec.height;
  const targetRatio = targetSpec.width / targetSpec.height;
  const cropLossRatio =
    sourceRatio === targetRatio
      ? 0
      : Number(Math.abs(1 - Math.min(sourceRatio, targetRatio) / Math.max(sourceRatio, targetRatio)).toFixed(2));

  const requiresCropConfirmation = cropLossRatio >= 0.25;
  const cropWarningMessage = requiresCropConfirmation
    ? `A mudança de ${sourceSpec.shortLabel} para ${targetSpec.shortLabel} altera a proporção em ${(cropLossRatio * 100).toFixed(0)}%. Revise o recorte ou use modo "Conter (sem corte)" para não cortar detalhes importantes da foto real.`
    : null;

  const srcLeft = sourceSpec.safeArea.leftPct * 100;
  const srcRight = (1 - sourceSpec.safeArea.rightPct) * 100;
  const srcTop = sourceSpec.safeArea.topPct * 100;
  const srcBottom = (1 - sourceSpec.safeArea.bottomPct) * 100;

  const tgtLeft = targetSpec.safeArea.leftPct * 100;
  const tgtRight = (1 - targetSpec.safeArea.rightPct) * 100;
  const tgtTop = targetSpec.safeArea.topPct * 100;
  const tgtBottom = (1 - targetSpec.safeArea.bottomPct) * 100;

  const srcSpanX = Math.max(10, srcRight - srcLeft);
  const srcSpanY = Math.max(10, srcBottom - srcTop);
  const tgtSpanX = Math.max(10, tgtRight - tgtLeft);
  const tgtSpanY = Math.max(10, tgtBottom - tgtTop);

  const adapted = input.sourceLayers.map((layer) => {
    const relX = Math.max(0, Math.min(1, (layer.xPct - srcLeft) / srcSpanX));
    const relY = Math.max(0, Math.min(0.92, (layer.yPct - srcTop) / srcSpanY));
    const newWidth = Math.max(20, Math.min(tgtSpanX, layer.widthPct * (tgtSpanX / srcSpanX)));
    const newX = Math.min(tgtRight - newWidth, Math.max(tgtLeft, tgtLeft + relX * tgtSpanX));
    const newY = Math.min(tgtBottom - 7, Math.max(tgtTop, tgtTop + relY * tgtSpanY));

    return {
      ...layer,
      xPct: Number(newX.toFixed(1)),
      yPct: Number(newY.toFixed(1)),
      widthPct: Number(newWidth.toFixed(1)),
    };
  });

  return {
    layers: adapted,
    cropLossRatio,
    requiresCropConfirmation,
    cropWarningMessage,
  };
}

export function reorderLayerZIndex(
  layers: StudioLayer[],
  layerId: string,
  direction: "up" | "down"
): StudioLayer[] {
  const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  const idx = ordered.findIndex((l) => l.id === layerId);
  if (idx === -1) return layers;
  const swapIdx = direction === "up" ? idx + 1 : idx - 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return layers;

  const currentZ = ordered[idx].zIndex;
  const targetZ = ordered[swapIdx].zIndex;
  const next = ordered.map((l, i) => {
    if (i === idx) return { ...l, zIndex: targetZ === currentZ ? currentZ + (direction === "up" ? 1 : -1) : targetZ };
    if (i === swapIdx) return { ...l, zIndex: currentZ };
    return l;
  });
  return next.sort((a, b) => a.zIndex - b.zIndex);
}

export function duplicateStudioLayer(layers: StudioLayer[], layerId: string): StudioLayer[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return layers;
  const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0);
  const copy: StudioLayer = {
    ...target,
    id: `${target.id}-copy-${Date.now().toString(36)}`,
    label: `${target.label} (cópia)`,
    yPct: Math.min(88, Number((target.yPct + 5).toFixed(1))),
    zIndex: maxZ + 1,
  };
  return [...layers, copy];
}

export function alignLayerToMargins(
  layer: StudioLayer,
  formatId: StudioFormatId,
  alignment: "left" | "center-x" | "right" | "top-safe" | "bottom-safe" | "fit-safe-width"
): StudioLayer {
  const spec = getStudioFormatSpec(formatId);
  const leftSafe = Number((spec.safeArea.leftPct * 100 + 1).toFixed(1));
  const rightSafe = Number(((1 - spec.safeArea.rightPct) * 100 - 1).toFixed(1));
  const topSafe = Number((spec.safeArea.topPct * 100 + 1).toFixed(1));
  const bottomSafe = Number(((1 - spec.safeArea.bottomPct) * 100 - 7).toFixed(1));
  const safeSpan = Number((rightSafe - leftSafe).toFixed(1));

  switch (alignment) {
    case "left":
      return { ...layer, xPct: leftSafe, align: "left" };
    case "center-x":
      return {
        ...layer,
        xPct: Number(Math.max(leftSafe, leftSafe + (safeSpan - layer.widthPct) / 2).toFixed(1)),
        align: "center",
      };
    case "right":
      return {
        ...layer,
        xPct: Number(Math.max(leftSafe, rightSafe - layer.widthPct).toFixed(1)),
        align: "right",
      };
    case "top-safe":
      return { ...layer, yPct: topSafe };
    case "bottom-safe":
      return { ...layer, yPct: bottomSafe };
    case "fit-safe-width":
      return { ...layer, xPct: leftSafe, widthPct: safeSpan };
  }
}

export interface StudioHistoryStack<T> {
  past: T[];
  present: T;
  future: T[];
}

export function pushStudioHistory<T>(
  stack: StudioHistoryStack<T>,
  nextPresent: T,
  maxPast = 30
): StudioHistoryStack<T> {
  return {
    past: [...stack.past.slice(-(maxPast - 1)), stack.present],
    present: nextPresent,
    future: [],
  };
}

export function undoStudioHistory<T>(stack: StudioHistoryStack<T>): StudioHistoryStack<T> {
  if (stack.past.length === 0) return stack;
  const previous = stack.past[stack.past.length - 1];
  return {
    past: stack.past.slice(0, -1),
    present: previous,
    future: [stack.present, ...stack.future],
  };
}

export function redoStudioHistory<T>(stack: StudioHistoryStack<T>): StudioHistoryStack<T> {
  if (stack.future.length === 0) return stack;
  const next = stack.future[0];
  return {
    past: [...stack.past, stack.present],
    present: next,
    future: stack.future.slice(1),
  };
}

export function estimateExportMetadata(input: {
  formatId: StudioFormatId;
  mimeType: StudioExportFormat;
  quality: number;
  hasTransparentBackground?: boolean;
}): {
  dimensionsLabel: string;
  extension: "png" | "jpg" | "webp";
  formatLabel: string;
  qualityLabel: string;
  transparencyApplicable: boolean;
  transparencyNote: string;
  estimatedSizeLabel: string;
} {
  const spec = getStudioFormatSpec(input.formatId);
  const pixels = spec.width * spec.height;
  const clampedQ = Math.min(1, Math.max(0.5, input.quality));

  if (input.mimeType === "image/png") {
    const estKB = Math.round((pixels * 0.45) / 1024);
    return {
      dimensionsLabel: `${spec.width}×${spec.height} px`,
      extension: "png",
      formatLabel: "PNG (Sem perdas)",
      qualityLabel: "100% lossless",
      transparencyApplicable: Boolean(input.hasTransparentBackground),
      transparencyNote: input.hasTransparentBackground
        ? "Transparência preservada neste formato PNG."
        : "Fundo opaco preenchido pelo layout da peça.",
      estimatedSizeLabel: estKB >= 1024 ? `~${(estKB / 1024).toFixed(1)} MB` : `~${estKB} KB`,
    };
  }

  if (input.mimeType === "image/webp") {
    const estKB = Math.round((pixels * (0.1 + clampedQ * 0.14)) / 1024);
    return {
      dimensionsLabel: `${spec.width}×${spec.height} px`,
      extension: "webp",
      formatLabel: "WebP (Leve p/ web/Meta)",
      qualityLabel: `${Math.round(clampedQ * 100)}%`,
      transparencyApplicable: Boolean(input.hasTransparentBackground),
      transparencyNote: input.hasTransparentBackground
        ? "WebP preserva transparência se o navegador suportar."
        : "Fundo opaco preenchido pelo layout da peça.",
      estimatedSizeLabel: estKB >= 1024 ? `~${(estKB / 1024).toFixed(1)} MB` : `~${estKB} KB`,
    };
  }

  const estKB = Math.round((pixels * (0.14 + clampedQ * 0.18)) / 1024);
  return {
    dimensionsLabel: `${spec.width}×${spec.height} px`,
    extension: "jpg",
    formatLabel: "JPG (Compatível universal)",
    qualityLabel: `${Math.round(clampedQ * 100)}%`,
    transparencyApplicable: false,
    transparencyNote: "JPG não suporta transparência (fundo sólido aplicado automaticamente).",
    estimatedSizeLabel: estKB >= 1024 ? `~${(estKB / 1024).toFixed(1)} MB` : `~${estKB} KB`,
  };
}

export function validateStudioTestCompatibility(input: {
  studioAccountId: string;
  studioObjective: StudioPieceObjective;
  test: {
    id: string;
    title: string;
    ad_account_id: string;
    objective?: string | null;
    result_unit?: string | null;
  };
}): { compatible: boolean; reason: string | null } {
  if (!input.studioAccountId) {
    return {
      compatible: false,
      reason: "Selecione a conta da peça antes de vincular a um teste criativo.",
    };
  }

  if (input.test.ad_account_id !== input.studioAccountId) {
    return {
      compatible: false,
      reason: `O teste "${input.test.title}" pertence a outra conta (${input.test.ad_account_id}) e não pode ser misturado.`,
    };
  }

  const objSpec =
    STUDIO_PIECE_OBJECTIVES.find((o) => o.id === input.studioObjective) ??
    STUDIO_PIECE_OBJECTIVES[0];

  const testObj = (input.test.objective || "").toUpperCase();
  const testUnit = (input.test.result_unit || "").toLowerCase();

  if (
    testUnit &&
    !objSpec.compatibleResultUnits.includes(testUnit) &&
    testObj &&
    !objSpec.metaObjectives.includes(testObj)
  ) {
    return {
      compatible: false,
      reason: `Unidade/objetivo incompatível: esta peça é de "${objSpec.label}", enquanto o teste "${input.test.title}" mede "${testUnit}".`,
    };
  }

  return { compatible: true, reason: null };
}

export function resolveLibraryAssetBadges(input: {
  approvalStatus: string;
  linkedAdName?: string | null;
  linkedAdResultLabel?: string | null;
  linkedTestTitle?: string | null;
}): {
  workflowLabel: string;
  workflowTone: "neutral" | "amber" | "emerald";
  adUsageBadge: string | null;
  observedResultBadge: string | null;
  testLinkBadge: string | null;
} {
  const normalized = (input.approvalStatus || "draft").toLowerCase();
  const workflowLabel =
    normalized === "approved"
      ? "Aprovado"
      : normalized === "in_review"
      ? "Em revisão"
      : normalized === "archived"
      ? "Arquivado"
      : "Rascunho";
  const workflowTone =
    normalized === "approved" ? "emerald" : normalized === "in_review" ? "amber" : "neutral";

  return {
    workflowLabel,
    workflowTone,
    adUsageBadge: input.linkedAdName ? `Usado em anúncio: ${input.linkedAdName}` : null,
    observedResultBadge:
      input.linkedAdName && input.linkedAdResultLabel
        ? `Resultado observado: ${input.linkedAdResultLabel}`
        : null,
    testLinkBadge: input.linkedTestTitle ? `Teste: ${input.linkedTestTitle}` : null,
  };
}

const DEFAULT_OR_PLACEHOLDER_TEXTS = new Set<string>([
  "defina a chamada confirmada",
  "novo texto confirmado",
  "condição especial",
  "oferta confirmada",
  ...STUDIO_TEMPLATES.map((t) => t.badgeText.trim().toLowerCase()),
  ...STUDIO_PIECE_OBJECTIVES.map((o) => o.defaultCta.trim().toLowerCase()),
]);

export function isDefaultOrPlaceholderStudioText(text: string | null | undefined): boolean {
  const norm = String(text || "").trim().toLowerCase();
  if (!norm) return true;
  if (DEFAULT_OR_PLACEHOLDER_TEXTS.has(norm)) return true;
  if (/^(ex:|placeholder|digite aqui|escreva aqui|clique para)/i.test(norm)) return true;
  return false;
}

export interface StudioExportAndSaveValidation {
  canDownload: boolean;
  canSave: boolean;
  hasValidFormat: boolean;
  hasValidMedia: boolean;
  hasRealTextContent: boolean;
  hasRenderableContent: boolean;
  hasTitle: boolean;
  downloadBlockedReason: string | null;
  saveBlockedReason: string | null;
}

export function validateStudioExportAndSave(input: {
  studioTitle: string;
  formatId: StudioFormatId;
  layers: StudioLayer[];
  hasValidMedia: boolean;
  mediaFailedToLoad?: boolean;
  isRenderingOrLoading?: boolean;
  facts?: Partial<ConfirmedCommercialFacts> | null;
}): StudioExportAndSaveValidation {
  const spec = STUDIO_FORMATS.find((f) => f.id === input.formatId) ?? null;
  const hasValidFormat = Boolean(spec && spec.width > 0 && spec.height > 0);
  const hasValidMedia = Boolean(input.hasValidMedia && !input.mediaFailedToLoad);
  const hasTitle = String(input.studioTitle || "").trim().length > 0;

  const visibleLayers = (input.layers || []).filter((l) => l.visible && l.text.trim().length > 0);
  const realUserLayers = visibleLayers.filter(
    (l) => l.kind !== "badge" && l.kind !== "cta" && !isDefaultOrPlaceholderStudioText(l.text)
  );
  const hasRealFacts = Boolean(
    input.facts &&
      [
        input.facts.vehicleOrOfferName,
        input.facts.headlineOffer,
        input.facts.confirmedPrice,
        input.facts.confirmedInstallment,
        input.facts.confirmedDownPayment,
        input.facts.fipeComparison,
        input.facts.confirmedDifferentials,
        input.facts.confirmedCondition,
      ].some((v) => String(v || "").trim().length > 0 && !isDefaultOrPlaceholderStudioText(v))
  );

  const hasRealTextContent = realUserLayers.length > 0 || hasRealFacts;
  const hasRenderableContent = hasValidFormat && (hasValidMedia || hasRealTextContent);

  let downloadBlockedReason: string | null = null;
  if (input.isRenderingOrLoading) {
    downloadBlockedReason = "Aguarde a conclusão do carregamento ou renderização da peça.";
  } else if (!hasValidFormat) {
    downloadBlockedReason = "Formato e dimensões inválidos para exportação.";
  } else if (input.mediaFailedToLoad) {
    downloadBlockedReason = "A mídia selecionada falhou ao carregar. Substitua ou remova o arquivo com erro.";
  } else if (!hasRenderableContent) {
    downloadBlockedReason = "Adicione uma imagem válida ou conteúdo real nas camadas antes de baixar.";
  }

  let saveBlockedReason: string | null = null;
  if (input.isRenderingOrLoading) {
    saveBlockedReason = "Aguarde o carregamento da peça antes de salvar.";
  } else if (input.mediaFailedToLoad) {
    saveBlockedReason = "A mídia selecionada falhou ao carregar e não pode ser salva na biblioteca.";
  } else if (!hasTitle && !hasRenderableContent) {
    saveBlockedReason = "Dê um nome à peça e adicione uma mídia válida ou conteúdo real antes de salvar.";
  } else if (!hasRenderableContent) {
    saveBlockedReason = "Um título sozinho não basta: adicione uma imagem válida ou conteúdo real antes de salvar.";
  } else if (!hasTitle) {
    saveBlockedReason = "Informe um título/nome para salvar este rascunho na biblioteca.";
  }

  return {
    canDownload: downloadBlockedReason === null,
    canSave: saveBlockedReason === null,
    hasValidFormat,
    hasValidMedia,
    hasRealTextContent,
    hasRenderableContent,
    hasTitle,
    downloadBlockedReason,
    saveBlockedReason,
  };
}

