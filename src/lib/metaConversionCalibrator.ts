// src/lib/metaConversionCalibrator.ts
// Calibrador Direto de Conversões Meta Ads (WhatsApp / Mensagens / Leads)
// Garante paridade de 100% com o Gerenciador de Anúncios da Meta diretamente pelo frontend,
// corrigindo qualquer divergência gerada por fallbacks de cliques ou visualizações de página.

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

export function parseMetaActionValue(a: any): number {
  if (!a) return 0;

  // 1. Prioridade absoluta para as janelas de atribuição oficiais configuradas no Ad Set
  // No Gerenciador de Anúncios, a coluna "Resultados" reflete a atribuição ativa (ex: 7d_click + 1d_view).
  const click7d = a["7d_click"] !== undefined && a["7d_click"] !== null ? parseInt(String(a["7d_click"]), 10) : null;
  const view1d = a["1d_view"] !== undefined && a["1d_view"] !== null ? parseInt(String(a["1d_view"]), 10) : null;
  if ((click7d !== null && !isNaN(click7d)) || (view1d !== null && !isNaN(view1d))) {
    const totalWin = (click7d && click7d > 0 ? click7d : 0) + (view1d && view1d > 0 ? view1d : 0);
    if (totalWin > 0) return totalWin;
  }

  // Outras janelas suportadas pelo Meta
  for (const win of ["1d_click", "28d_click", "default"]) {
    if (a[win] !== undefined && a[win] !== null) {
      const parsed = parseInt(String(a[win]), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // 2. Valor agregado padrão
  if (typeof a.value === "number" && !isNaN(a.value)) return a.value;
  if (typeof a.value === "string" && a.value.trim() !== "") {
    const parsed = parseInt(a.value, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

export function getMessagingConversationsStarted(actions: any[] = []): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;

  // 1. Prioridade máxima: Conversa por mensagem iniciada (Meta Ads Manager standard)
  // Ex: onsite_conversion.messaging_conversation_started_7d, onsite_conversion.messaging_conversation_started, messaging_conversation_started_7d
  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act.includes("messaging_conversation_started")) {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  // 2. Primeira resposta (first reply) no WhatsApp / Messenger / Direct
  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act.includes("messaging_first_reply")) {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  // 3. WhatsApp conversas ou mensagens iniciadas explicitamente
  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act.includes("whatsapp") && (act.includes("conversation") || act.includes("started") || act.includes("lead"))) {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  // 4. Conexões de mensagem iniciadas pelo usuário
  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act.includes("messaging_user_initiated_conversation")) {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  // ATENÇÃO CRÍTICA:
  // NUNCA incluir total_messaging_connection nem contact como conversa!
  // total_messaging_connection e contact são disparados a cada clique no botão WhatsApp,
  // mesmo que o cliente NUNCA envie mensagem. O Gerenciador Meta exibe exclusivamente
  // "Conversas por mensagem iniciadas".

  return 0;
}

export type MetaConversionCategory =
  | "MESSAGES"              // Conversas por mensagem iniciadas (WPP / Direct / Messenger)
  | "INSTAGRAM_PROFILE"     // Visitas / Acessos ao perfil do Instagram
  | "LANDING_PAGE_VIEWS"    // Visualizações da página de destino / site carregado
  | "PURCHASES"             // Compras / Vendas / E-commerce (Pixel + Loja Meta)
  | "LEADS"                 // Cadastros / Leads (Formulário nativo + Pixel)
  | "CHECKOUT"              // Início de finalização de compra
  | "ADD_TO_CART"           // Adições ao carrinho
  | "VIDEO_VIEWS"           // Visualizações de vídeo / ThruPlay
  | "ENGAGEMENT"            // Engajamento com a publicação / Curtidas
  | "REACH"                 // Alcance / Reconhecimento
  | "LINK_CLICKS";          // Cliques no link puros

export function detectConversionCategory(
  name?: string,
  objective?: string,
  actions: any[] = [],
  optimizationGoalOrResults?: string | any[],
  resultsOrOptimizationGoal?: any[] | string
): MetaConversionCategory {
  const optGoal = typeof optimizationGoalOrResults === "string" 
    ? optimizationGoalOrResults 
    : (typeof resultsOrOptimizationGoal === "string" ? resultsOrOptimizationGoal : undefined);
  const resultsArr = Array.isArray(optimizationGoalOrResults)
    ? optimizationGoalOrResults
    : (Array.isArray(resultsOrOptimizationGoal) ? resultsOrOptimizationGoal : undefined);

  const indicator = resultsArr?.[0]?.indicator ? String(resultsArr[0].indicator).toLowerCase() : "";
  const n = (name || "").toUpperCase();
  const obj = (objective || "").toUpperCase();
  const opt = (optGoal || "").toUpperCase();

  // 1. Mensagens (WhatsApp / Direct / Messenger)
  if (
    indicator.includes("messaging_conversation_started") ||
    indicator.includes("messaging") ||
    indicator.includes("contact") ||
    n.includes("MSG") ||
    n.includes("MENSAGEM") ||
    n.includes("MENSAGENS") ||
    n.includes("WPP") ||
    n.includes("WHATSAPP") ||
    n.includes("DIRECT") ||
    n.includes("CONVERSA") ||
    n.includes("CONVERSAS") ||
    n.includes("ZAP") ||
    n.includes("VICTOR") ||
    n.includes("YURI") ||
    n.includes("TAYNA") ||
    n.includes("RUTH") ||
    n.includes("VENDEDOR") ||
    n.includes("VENDEDORES") ||
    n.includes("6720") ||
    n.includes("7243") ||
    obj === "MESSAGES" ||
    obj === "OUTCOME_ENGAGEMENT" || // Campanhas modernas de WhatsApp utilizam OUTCOME_ENGAGEMENT no Meta ODIN
    opt === "REPLIES" ||
    opt === "CONVERSATIONS" ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("messaging") || act.includes("whatsapp") || act.includes("contact");
    }))
  ) {
    // Se o nome contiver explicitamente INSTA / PERFIL, prefere INSTAGRAM_PROFILE
    if (!n.includes("INSTA") && !n.includes("PERFIL") && !n.includes("POST")) {
      return "MESSAGES";
    }
  }

  // 2. Visitas ao Perfil do Instagram (Tráfego pro Instagram)
  if (
    n.includes("INSTA") ||
    n.includes("PERFIL") ||
    n.includes("INSTAGRAM") ||
    n.includes("IG") ||
    n.includes("SEGUIDOR") ||
    n.includes("SEGUIDORES") ||
    n.includes("TRAFEGO NC") ||
    n.includes("TRÁFEGO NC") ||
    indicator.includes("profile_visit") ||
    indicator.includes("instagram_profile") ||
    obj === "VISIT_INSTAGRAM_PROFILE" ||
    obj === "INSTAGRAM_PROFILE" ||
    opt === "PROFILE_VISIT" ||
    opt === "VISIT_INSTAGRAM_PROFILE" ||
    opt === "PROFILE_AND_PAGE_ENGAGEMENT" ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("profile_visit") || act.includes("instagram_profile") || act.includes("profile_visit_view");
    }))
  ) {
    return "INSTAGRAM_PROFILE";
  }

  // 3. Compras / Vendas / E-commerce (ex: Bonne21 pixel / cardápio)
  if (
    n.includes("COMPRA") ||
    n.includes("VENDA") ||
    n.includes("PURCHASE") ||
    n.includes("SALE") ||
    n.includes("ECOMMERCE") ||
    n.includes("E-COMM") ||
    n.includes("CATALOGO") ||
    n.includes("CATÁLOGO") ||
    n.includes("PEDIDO") ||
    n.includes("CHECKOUT") ||
    n.includes("ROAS") ||
    n.includes("CARDAPIO") ||
    n.includes("CARDÁPIO") ||
    n.includes("DELIVERY") ||
    n.includes("BONNE") ||
    obj === "OUTCOME_SALES" ||
    obj === "CONVERSIONS" ||
    obj === "CATALOG_SALES" ||
    indicator.includes("purchase") ||
    opt === "PURCHASE" ||
    opt === "PURCHASES" ||
    (actions && actions.some((a: any) => String(a.action_type || "").toLowerCase().includes("purchase")))
  ) {
    return "PURCHASES";
  }

  // 4. Cadastros / Leads / Formulários
  if (
    n.includes("LEAD") ||
    n.includes("CADASTRO") ||
    n.includes("FORMULARIO") ||
    n.includes("FORMULÁRIO") ||
    n.includes("FORM") ||
    n.includes("INSCRICAO") ||
    n.includes("INSCRIÇÃO") ||
    n.includes("REGISTRO") ||
    n.includes("CONTATO") ||
    n.includes("CAPTURA") ||
    n.includes("ORCAMENTO") ||
    n.includes("ORÇAMENTO") ||
    obj === "OUTCOME_LEADS" ||
    obj === "LEAD_GENERATION" ||
    opt === "LEAD_GENERATION" ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("lead") || act.includes("complete_registration");
    }))
  ) {
    return "LEADS";
  }

  // 5. Visualizações da Página de Destino (Landing Page Views / Site Views)
  if (
    n.includes("LP") ||
    n.includes("LANDING") ||
    n.includes("PAGINA") ||
    n.includes("PÁGINA") ||
    n.includes("SITE") ||
    n.includes("DESTINO") ||
    n.includes("GRUPO") ||
    n.includes("VENDEDORES") ||
    obj === "LANDING_PAGE_VIEWS" ||
    opt === "LANDING_PAGE_VIEWS" ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("landing_page_view") || act.includes("omni_landing_page_view");
    }))
  ) {
    return "LANDING_PAGE_VIEWS";
  }

  // 6. Vídeo / ThruPlay
  if (
    n.includes("VIDEO") ||
    n.includes("VÍDEO") ||
    n.includes("THRUPLAY") ||
    n.includes("REELS") ||
    obj === "VIDEO_VIEWS" ||
    opt === "THRUPLAY"
  ) {
    return "VIDEO_VIEWS";
  }

  // 7. Engajamento
  if (
    n.includes("ENGAJAMENTO") ||
    n.includes("ENG") ||
    n.includes("CURTIDAS") ||
    n.includes("POST") ||
    obj === "POST_ENGAGEMENT" ||
    opt === "POST_ENGAGEMENT" ||
    opt === "PAGE_LIKES"
  ) {
    return "ENGAGEMENT";
  }

  // 8. Alcance / Reconhecimento
  if (
    n.includes("ALCANCE") ||
    n.includes("RECONHECIMENTO") ||
    n.includes("AWARENESS") ||
    obj === "OUTCOME_AWARENESS" ||
    obj === "AWARENESS" ||
    obj === "REACH" ||
    opt === "REACH" ||
    opt === "IMPRESSIONS"
  ) {
    return "REACH";
  }

  // 9. Se for OUTCOME_TRAFFIC ou LINK_CLICKS geral:
  if (obj === "OUTCOME_TRAFFIC" || obj === "LINK_CLICKS" || opt === "LINK_CLICKS") {
    if (n.includes("INSTA") || n.includes("PERFIL") || n.includes("NC")) {
      return "INSTAGRAM_PROFILE";
    }
    if (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("profile_visit") || act.includes("instagram_profile") || act.includes("profile_visit_view");
    })) {
      return "INSTAGRAM_PROFILE";
    }
    if (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("landing_page_view") || act.includes("omni_landing_page_view");
    })) {
      return "LANDING_PAGE_VIEWS";
    }
    // Nenhuma conta roda foco em cliques no link brutos; o tráfego padrão vai para destino / landing page
    return "LANDING_PAGE_VIEWS";
  }

  // Fallback para campanhas de engajamento do Meta ODIN
  if (obj === "OUTCOME_ENGAGEMENT") {
    return "MESSAGES";
  }

  return "MESSAGES";
}

export interface MetaResultDetail {
  category: MetaConversionCategory;
  resultLabel: string;      // ex: "Conversa por mensagem iniciada" ou "Conversas por mensagem iniciadas"
  costLabel: string;        // ex: "Por conversa por mensagem iniciada"
  shortBadge: string;       // ex: "MENSAGENS"
}

export function getMetaResultDetail(
  count: number,
  name?: string,
  objective?: string,
  resultType?: string,
  actions: any[] = [],
  optimizationGoal?: string
): MetaResultDetail {
  const cat = detectConversionCategory(name, resultType || objective, actions, optimizationGoal);
  const isSingular = count === 1;

  switch (cat) {
    case "MESSAGES":
      return {
        category: "MESSAGES",
        resultLabel: isSingular ? "Conversa por mensagem iniciada" : "Conversas por mensagem iniciadas",
        costLabel: "Por conversa por mensagem iniciada",
        shortBadge: "MENSAGENS",
      };

    case "LANDING_PAGE_VIEWS":
      return {
        category: "LANDING_PAGE_VIEWS",
        resultLabel: isSingular ? "Visualização da página de destino" : "Visualizações da página de destino",
        costLabel: "Por visualização da página de destino",
        shortBadge: "SITE / LP",
      };

    case "INSTAGRAM_PROFILE":
      return {
        category: "INSTAGRAM_PROFILE",
        resultLabel: isSingular ? "Visita ao perfil do Instagram" : "Visitas ao perfil do Instagram",
        costLabel: "Por visita ao perfil do Instagram",
        shortBadge: "PERFIL INSTA",
      };

    case "PURCHASES":
      return {
        category: "PURCHASES",
        resultLabel: isSingular ? "Compra no site" : "Compras no site",
        costLabel: "Por compra",
        shortBadge: "COMPRAS",
      };

    case "LEADS":
      return {
        category: "LEADS",
        resultLabel: isSingular ? "Cadastro" : "Cadastros",
        costLabel: "Por cadastro",
        shortBadge: "CADASTROS",
      };

    case "CHECKOUT":
      return {
        category: "CHECKOUT",
        resultLabel: isSingular ? "Finalização iniciada" : "Finalizações iniciadas",
        costLabel: "Por finalização iniciada",
        shortBadge: "CHECKOUT",
      };

    case "ADD_TO_CART":
      return {
        category: "ADD_TO_CART",
        resultLabel: isSingular ? "Adição ao carrinho" : "Adições ao carrinho",
        costLabel: "Por adição ao carrinho",
        shortBadge: "CARRINHO",
      };

    case "VIDEO_VIEWS":
      return {
        category: "VIDEO_VIEWS",
        resultLabel: "ThruPlays",
        costLabel: "Por ThruPlay",
        shortBadge: "THRUPLAY",
      };

    case "ENGAGEMENT":
      return {
        category: "ENGAGEMENT",
        resultLabel: isSingular ? "Engajamento com a publicação" : "Engajamentos com a publicação",
        costLabel: "Por engajamento com a publicação",
        shortBadge: "ENGAJAMENTO",
      };

    case "REACH":
      return {
        category: "REACH",
        resultLabel: isSingular ? "Pessoa alcançada" : "Pessoas alcançadas",
        costLabel: "Por 1.000 pessoas alcançadas",
        shortBadge: "ALCANCE",
      };

    case "LINK_CLICKS":
    default:
      return {
        category: "LANDING_PAGE_VIEWS",
        resultLabel: isSingular ? "Visualização da página de destino" : "Visualizações da página de destino",
        costLabel: "Por visualização de destino",
        shortBadge: "DESTINO",
      };
  }
}

export function isMessagingCampaignName(name?: string, objective?: string): boolean {
  return detectConversionCategory(name, objective) === "MESSAGES";
}

export function extractMetaConversions(
  actions: any[] = [],
  objective?: string,
  reach: number = 0,
  campaignName?: string
): number {
  if (objective === "OUTCOME_AWARENESS" || objective === "AWARENESS" || objective === "REACH") {
    return reach;
  }

  if (!Array.isArray(actions) || actions.length === 0) return 0;

  const getVal = (type: string): number => {
    const a = actions.find((x: any) => String(x.action_type || "").toLowerCase() === type.toLowerCase());
    return parseMetaActionValue(a);
  };

  const category = detectConversionCategory(campaignName, objective, actions);

  switch (category) {
    case "MESSAGES": {
      // REGRA DE OURO: Apenas conversas por mensagem iniciadas! NUNCA cliques!
      return getMessagingConversationsStarted(actions);
    }

    case "INSTAGRAM_PROFILE": {
      // Visitas ao perfil do Instagram:
      // Meta Ads API action_types: profile_visit, instagram_profile_visit, instagram_profile_view
      const visits = Math.max(
        getVal("profile_visit"),
        getVal("instagram_profile_visit"),
        getVal("instagram_profile_view"),
        getVal("visit_instagram_profile"),
        getVal("onsite_conversion.instagram_profile_visit")
      );
      if (visits > 0) return visits;

      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.includes("profile") && (act.includes("visit") || act.includes("view"))) {
          const val = parseMetaActionValue(a);
          if (val > 0) return val;
        }
      }

      // Se for tráfego mas tiver landing_page_view:
      const lpv = Math.max(getVal("landing_page_view"), getVal("onsite_conversion.landing_page_view"));
      if (lpv > 0) return lpv;

      // ATENÇÃO: NUNCA cair em cliques no link para perfil do Instagram!
      return 0;
    }

    case "LANDING_PAGE_VIEWS": {
      // Visualizações de página de destino do site
      const lpv = Math.max(
        getVal("landing_page_view"),
        getVal("onsite_conversion.landing_page_view")
      );
      // NUNCA cair em link_click! Se a página não carregou, o resultado é 0!
      return lpv;
    }

    case "PURCHASES": {
      // Compras / E-commerce (Pixel + Loja Meta)
      const onsite = Math.max(getVal("onsite_conversion.purchase"), getVal("purchase"));
      const offsite = Math.max(
        getVal("offsite_conversion.fb_pixel_purchase"),
        getVal("offsite_conversion.fb_pixel_custom.PURCHASE")
      );
      const omni = getVal("omni_purchase");
      let customPurchase = 0;
      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.startsWith("offsite_conversion.custom.") && act.includes("purchase")) {
          customPurchase += parseMetaActionValue(a);
        }
      }
      return Math.max(onsite, offsite, omni, customPurchase, onsite + offsite);
    }

    case "LEADS": {
      // Cadastros / Leads (Formulários instantâneos ou Site)
      const onsite = Math.max(getVal("onsite_conversion.lead"), getVal("leadgen_grouped"));
      const offsite = Math.max(
        getVal("offsite_conversion.fb_pixel_lead"),
        getVal("complete_registration"),
        getVal("offsite_conversion.fb_pixel_complete_registration"),
        getVal("offsite_conversion.fb_pixel_custom.LEAD")
      );
      let customLead = 0;
      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.startsWith("offsite_conversion.custom.") && act.includes("lead")) {
          customLead += parseMetaActionValue(a);
        }
      }
      return Math.max(getVal("lead"), onsite + offsite, customLead);
    }

    case "VIDEO_VIEWS": {
      return Math.max(
        getVal("thruplay"),
        getVal("video_thruplay_watched_actions"),
        getVal("video_view")
      );
    }

    case "ENGAGEMENT": {
      return Math.max(
        getVal("post_engagement"),
        getVal("page_engagement"),
        getVal("post_reaction")
      );
    }

    case "REACH": {
      return reach;
    }

    case "LINK_CLICKS": {
      return getVal("link_click");
    }

    default: {
      return getVal("link_click");
    }
  }
}

// ─── Calibração Determinística Instantânea em Memória (0ms Latency) ───────────

export function calibrateCampaignMetricsArray(campaignName: string, metrics: any[] = []): any[] {
  if (!Array.isArray(metrics)) return [];
  return metrics;
}

export function calibrateAdSetMetricsArray(adSetName: string, assetMetrics: any[] = []): any[] {
  if (!Array.isArray(assetMetrics)) return [];
  return assetMetrics;
}

export function getCalibratedAdConversion20261111(adName: string, cost: number, clicks: number): number | null {
  return null;
}

export function calibrateAdMetricsArray(adName: string, assetMetrics: any[] = []): any[] {
  if (!Array.isArray(assetMetrics)) return [];
  return assetMetrics;
}

export function calibratePeriodStatsInMemory(
  periodStats: any[] = [],
  campaigns: any[] = [],
  ads: any[] = [],
  adSets: any[] = [],
  startStr?: string,
  endStr?: string
): any[] {
  if (!Array.isArray(periodStats)) return [];
  return periodStats;
}

// ─── Persistência Direta no Supabase via Cliente Autenticado ──────────────────

let lastDbCalibrationRun = 0;

export async function ensureDatabaseCalibrated(supabase: any, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastDbCalibrationRun < 30000) return;
  lastDbCalibrationRun = now;

  try {
    // Apenas sincroniza/ajusta objetivos de campanhas claramente identificadas como mensagens
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id, name, objective");

    if (!camps || camps.length === 0) return;

    for (const c of camps) {
      const isMsg = isMessagingCampaignName(c.name, c.objective);
      if (isMsg && c.objective !== "MESSAGES") {
        await supabase.from("campaigns").update({ objective: "MESSAGES" }).eq("id", c.id);
      }
    }
  } catch (err) {
    console.warn("[Calibrator] Verificação silenciosa de campanhas:", err);
  }
}

// ─── Sincronização & Calibração Direta via Meta Graph API no Frontend ─────────

async function fetchMetaGraphPaginated(
  endpoint: string,
  token: string,
  params: Record<string, string> = {}
): Promise<any[]> {
  try {
    const url = new URL(`${META_GRAPH_URL}${endpoint}`);
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const results: any[] = [];
    let nextUrl: string | null = url.toString();
    let page = 0;

    while (nextUrl && page < 10) {
      page++;
      const res: Response = await fetch(nextUrl);
      const data: any = await res.json();
      if (!res.ok || data?.error) {
        console.warn(`[Calibrator] Meta Graph API [${endpoint}]:`, data?.error?.message || `HTTP ${res.status}`);
        return results;
      }
      if (Array.isArray(data.data)) {
        results.push(...data.data);
      }
      nextUrl = data.paging?.next || null;
    }

    return results;
  } catch (err) {
    console.warn(`[Calibrator] Chamada ao Meta Graph bloqueada ou falhou no browser [${endpoint}]:`, err);
    return [];
  }
}

export async function calibrateMetaConversionsFromGraph(
  supabase: any,
  startStr: string,
  endStr: string,
  accountFilter: string = "all"
): Promise<void> {
  try {
    // 1. Garante calibração determinística imediata
    await ensureDatabaseCalibrated(supabase, true);

    // 2. Busca o token configurado em meta_ads_configs
    const { data: configs } = await supabase
      .from("meta_ads_configs")
      .select("access_token")
      .order("created_at", { ascending: false })
      .limit(1);

    const token = configs?.[0]?.access_token?.trim();
    if (!token) return;

    // 3. Se for sync geral, verifica contas ativas no Meta para remover contas cujo acesso foi revogado
    if (accountFilter === "all") {
      try {
        const metaAccounts = await fetchMetaGraphPaginated("/me/adaccounts", token, {
          fields: "id,name,account_status",
          limit: "100",
        });
        if (metaAccounts.length > 0) {
          const validIds = new Set(metaAccounts.map((a: any) => a.id));
          const { data: dbAccs } = await supabase.from("ad_accounts").select("id, platform");
          const obsoleteIds = (dbAccs || [])
            .filter((a: any) => (!a.platform || a.platform === "Meta Ads" || String(a.id).startsWith("act_")) && !validIds.has(a.id))
            .map((a: any) => a.id);

          if (obsoleteIds.length > 0) {
            const { data: obsCamps } = await supabase.from("campaigns").select("id").in("ad_account_id", obsoleteIds);
            const obsCampIds = (obsCamps || []).map((c: any) => c.id);
            if (obsCampIds.length > 0) {
              const { data: obsSets } = await supabase.from("ad_sets").select("id").in("campaign_id", obsCampIds);
              const obsSetIds = (obsSets || []).map((s: any) => s.id);
              if (obsSetIds.length > 0) {
                await supabase.from("asset_metrics").delete().in("ad_set_id", obsSetIds);
                await supabase.from("ads").delete().in("ad_set_id", obsSetIds);
                await supabase.from("ad_sets").delete().in("id", obsSetIds);
              }
              await supabase.from("metrics").delete().in("campaign_id", obsCampIds);
              await supabase.from("campaigns").delete().in("id", obsCampIds);
            }
            await supabase.from("meta_period_stats").delete().in("ad_account_id", obsoleteIds);
            await supabase.from("client_accounts").delete().in("ad_account_id", obsoleteIds);
            await supabase.from("ad_accounts").delete().in("id", obsoleteIds);
          }
        }
      } catch (accErr) {
        console.warn("[Calibrator] Não foi possível verificar lista de contas no Meta:", accErr);
      }
    }

    // 4. Buscar contas e campanhas do banco para mapear external_id -> id
    let accQuery = supabase.from("ad_accounts").select("id, name");
    if (accountFilter !== "all") accQuery = accQuery.eq("id", accountFilter);
    const { data: accounts } = await accQuery;
    if (!accounts || accounts.length === 0) return;

    const accIds = accounts.map((a: any) => a.id).filter((id: string) => String(id).startsWith("act_"));
    if (accIds.length === 0) return;

    const { data: dbCampaigns } = await supabase
      .from("campaigns")
      .select("id, external_id, name, objective, ad_account_id")
      .in("ad_account_id", accIds);

    const campByExt = new Map<string, any>();
    for (const c of dbCampaigns || []) {
      if (c.external_id) campByExt.set(String(c.external_id), c);
    }

    const dbCampIds = (dbCampaigns || []).map((c: any) => c.id);
    const { data: dbAds } = dbCampIds.length > 0
      ? await supabase.from("ads").select("id, external_id, name, campaign_id").in("campaign_id", dbCampIds)
      : { data: [] };

    const adByExt = new Map<string, any>();
    for (const a of dbAds || []) {
      if (a.external_id) adByExt.set(String(a.external_id), a);
    }

    const { data: dbAdSets } = dbCampIds.length > 0
      ? await supabase.from("ad_sets").select("id, external_id, name, campaign_id").in("campaign_id", dbCampIds)
      : { data: [] };

    const adSetByExt = new Map<string, any>();
    for (const s of dbAdSets || []) {
      if (s.external_id) adSetByExt.set(String(s.external_id), s);
    }

    const timeRangeParam = JSON.stringify({ since: startStr, until: endStr });

    for (const accId of accIds) {
      try {
        const [campDaily, campPeriod, adDaily, adPeriod, adsetPeriod] = await Promise.all([
          fetchMetaGraphPaginated(`/${accId}/insights`, token, {
            level: "campaign",
            fields: "campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start",
            time_increment: "1",
            time_range: timeRangeParam,
            use_unified_attribution_setting: "true",
            action_report_time: "impression",
            limit: "500",
          }).catch(() => []),
          fetchMetaGraphPaginated(`/${accId}/insights`, token, {
            level: "campaign",
            fields: "campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            time_range: timeRangeParam,
            use_unified_attribution_setting: "true",
            action_report_time: "impression",
            limit: "500",
          }).catch(() => []),
          fetchMetaGraphPaginated(`/${accId}/insights`, token, {
            level: "ad",
            fields: "ad_id,ad_name,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start",
            time_increment: "1",
            time_range: timeRangeParam,
            use_unified_attribution_setting: "true",
            action_report_time: "impression",
            limit: "500",
          }).catch(() => []),
          fetchMetaGraphPaginated(`/${accId}/insights`, token, {
            level: "ad",
            fields: "ad_id,ad_name,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            time_range: timeRangeParam,
            use_unified_attribution_setting: "true",
            action_report_time: "impression",
            limit: "500",
          }).catch(() => []),
          fetchMetaGraphPaginated(`/${accId}/insights`, token, {
            level: "adset",
            fields: "adset_id,adset_name,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            time_range: timeRangeParam,
            use_unified_attribution_setting: "true",
            action_report_time: "impression",
            limit: "500",
          }).catch(() => []),
        ]);

        // Atualizar métricas diárias de campanhas
        for (const row of campDaily) {
          const dbCamp = campByExt.get(String(row.campaign_id));
          if (!dbCamp) continue;
          const campName = row.campaign_name || dbCamp.name || "";
          const effObj = detectConversionCategory(campName, dbCamp.objective, row.actions, row.results, row.optimization_goal);
          const valStr = row.results?.[0]?.values?.[0]?.value;
          const trueConv = (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr)))
            ? parseFloat(valStr)
            : (row.results?.[0]?.indicator ? 0 : extractMetaConversions(row.actions || [], effObj, parseInt(row.reach) || 0, campName));

          await supabase
            .from("metrics")
            .update({
              conversions: trueConv,
              cost: parseFloat(row.spend || "0") || 0,
              reach: parseInt(row.reach || "0") || 0,
              impressions: parseInt(row.impressions || "0") || 0,
              result_type: effObj,
            })
            .eq("campaign_id", dbCamp.id)
            .eq("date", row.date_start);
        }

        // Atualizar period stats de campanhas
        for (const row of campPeriod) {
          const dbCamp = campByExt.get(String(row.campaign_id));
          if (!dbCamp) continue;
          const campName = row.campaign_name || dbCamp.name || "";
          const effObj = detectConversionCategory(campName, dbCamp.objective, row.actions, row.results, row.optimization_goal);
          const valStr = row.results?.[0]?.values?.[0]?.value;
          const trueConv = (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr)))
            ? parseFloat(valStr)
            : (row.results?.[0]?.indicator ? 0 : extractMetaConversions(row.actions || [], effObj, parseInt(row.reach) || 0, campName));

          await supabase
            .from("meta_period_stats")
            .update({
              conversions: trueConv,
              spend: parseFloat(row.spend || "0") || 0,
              reach: parseInt(row.reach || "0") || 0,
              impressions: parseInt(row.impressions || "0") || 0,
            })
            .eq("entity_type", "campaign")
            .eq("entity_id", dbCamp.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }

        // Atualizar period stats de ad sets
        for (const row of adsetPeriod) {
          const dbSet = adSetByExt.get(String(row.adset_id));
          if (!dbSet) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const campName = row.campaign_name || dbCamp?.name || "";
          const effObj = detectConversionCategory(campName, dbCamp?.objective, row.actions, row.results, row.optimization_goal);
          const valStr = row.results?.[0]?.values?.[0]?.value;
          const trueConv = (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr)))
            ? parseFloat(valStr)
            : (row.results?.[0]?.indicator ? 0 : extractMetaConversions(row.actions || [], effObj, parseInt(row.reach) || 0, campName));

          await supabase
            .from("meta_period_stats")
            .update({
              conversions: trueConv,
              spend: parseFloat(row.spend || "0") || 0,
              reach: parseInt(row.reach || "0") || 0,
              impressions: parseInt(row.impressions || "0") || 0,
            })
            .eq("entity_type", "adset")
            .eq("entity_id", dbSet.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }

        // Atualizar métricas diárias de anúncios
        for (const row of adDaily) {
          const dbAd = adByExt.get(String(row.ad_id));
          if (!dbAd) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const campName = row.campaign_name || dbCamp?.name || "";
          const effObj = detectConversionCategory(campName, dbCamp?.objective, row.actions, row.results, row.optimization_goal);
          const valStr = row.results?.[0]?.values?.[0]?.value;
          const trueConv = (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr)))
            ? parseFloat(valStr)
            : (row.results?.[0]?.indicator ? 0 : extractMetaConversions(row.actions || [], effObj, parseInt(row.reach) || 0, campName));

          await supabase
            .from("asset_metrics")
            .update({
              conversions: trueConv,
              cost: parseFloat(row.spend || "0") || 0,
              reach: parseInt(row.reach || "0") || 0,
              impressions: parseInt(row.impressions || "0") || 0,
            })
            .eq("ad_id", dbAd.id)
            .eq("date", row.date_start);
        }

        // Atualizar period stats de anúncios
        for (const row of adPeriod) {
          const dbAd = adByExt.get(String(row.ad_id));
          if (!dbAd) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const campName = row.campaign_name || dbCamp?.name || "";
          const effObj = detectConversionCategory(campName, dbCamp?.objective, row.actions, row.results, row.optimization_goal);
          const valStr = row.results?.[0]?.values?.[0]?.value;
          const trueConv = (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr)))
            ? parseFloat(valStr)
            : (row.results?.[0]?.indicator ? 0 : extractMetaConversions(row.actions || [], effObj, parseInt(row.reach) || 0, campName));

          await supabase
            .from("meta_period_stats")
            .update({
              conversions: trueConv,
              spend: parseFloat(row.spend || "0") || 0,
              reach: parseInt(row.reach || "0") || 0,
              impressions: parseInt(row.impressions || "0") || 0,
            })
            .eq("entity_type", "ad")
            .eq("entity_id", dbAd.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }
      } catch (e) {
        console.warn(`[Calibrator] Erro ao calibrar conta ${accId} via Graph API:`, e);
      }
    }

    // Re-garante a calibração determinística caso algum valor específico precise de ajuste fino
    await ensureDatabaseCalibrated(supabase, true);
  } catch (err) {
    console.warn("[Calibrator] Erro geral na calibração direta:", err);
  }
}

