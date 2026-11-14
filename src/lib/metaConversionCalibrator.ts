// src/lib/metaConversionCalibrator.ts
// Calibrador Direto de Conversões Meta Ads — alinhado integralmente ao núcleo metaIntegrationCore.ts.
// Nunca sobrescreve objetivos nativos da Meta por heurísticas de nome nem exclui contas em listagens parciais.

import {
  classifyMetaEvent,
  type MetaConversionCategory as DomainMetaConversionCategory,
} from "./metricsDomain";
import {
  detectStrictConversionCategory,
  extractActionByExactTypes,
  extractMetaInsightMetrics,
  metaFetchPaginatedWithStatus,
  parseMetaActionNumericValue,
  type NormalizedResultCategory,
} from "./metaIntegrationCore";

export function parseMetaActionValue(a: any): number {
  return parseMetaActionNumericValue(a);
}

export function getMessagingConversationsStarted(actions: any[] = []): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  return extractActionByExactTypes(actions, [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started",
    "messaging_conversation_started_7d",
    "whatsapp_conversation_started",
    "onsite_conversion.messaging_first_reply",
  ]);
}

export type MetaConversionCategory = NormalizedResultCategory;

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

  const indicator = resultsArr?.[0]?.indicator ? String(resultsArr[0].indicator) : undefined;

  // Prioridade absoluta ao contrato estrito Meta API (results -> optimization_goal -> actions -> objective)
  const strict = detectStrictConversionCategory({
    rawObjective: objective,
    optimizationGoal: optGoal,
    results: resultsArr,
    actions,
  });
  if (strict !== "UNKNOWN") {
    return strict;
  }

  const classified = classifyMetaEvent({
    campaignName: name,
    rawObjective: objective,
    optimizationGoal: optGoal,
    resultsIndicator: indicator,
    actions,
  });
  return (classified.category as MetaConversionCategory) || "UNKNOWN";
}

export interface MetaResultDetail {
  category: MetaConversionCategory;
  resultLabel: string;
  costLabel: string;
  shortBadge: string;
}

export function getMetaResultDetail(
  count: number,
  name?: string,
  objective?: string,
  resultType?: string,
  actions: any[] = [],
  optimizationGoal?: string
): MetaResultDetail {
  const cls = classifyMetaEvent({
    campaignName: name,
    rawObjective: objective,
    resultType,
    optimizationGoal,
    actions,
  });
  const cat = (cls.category !== "UNKNOWN"
    ? cls.category
    : detectConversionCategory(name, resultType || objective, actions, optimizationGoal)) as DomainMetaConversionCategory;
  const isSingular = count === 1;

  if (cat === "UNKNOWN") {
    return {
      category: "UNKNOWN",
      resultLabel: isSingular ? "Resultado (revisar evento)" : "Resultados (revisar evento)",
      costLabel: "Por resultado",
      shortBadge: "REVISAR",
    };
  }

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
      return {
        category: "LINK_CLICKS",
        resultLabel: isSingular ? "Clique no link" : "Cliques no link",
        costLabel: "Por clique no link",
        shortBadge: "CLIQUES",
      };

    default:
      return {
        category: "UNKNOWN",
        resultLabel: isSingular ? "Resultado (revisar evento)" : "Resultados (revisar evento)",
        costLabel: "Por resultado",
        shortBadge: "REVISAR",
      };
  }
}

export function isMessagingCampaignName(_name?: string, objective?: string): boolean {
  return detectConversionCategory(undefined, objective) === "MESSAGES";
}

export function extractMetaConversions(
  actions: any[] = [],
  objective?: string,
  reach: number = 0,
  _campaignName?: string,
  results?: any[],
  optimizationGoal?: string
): number {
  const extracted = extractMetaInsightMetrics(
    { actions, results, reach, objective, optimization_goal: optimizationGoal },
    { rawObjective: objective, optimizationGoal }
  );
  return extracted.resultCount ?? 0;
}

export function calibrateCampaignMetricsArray(_campaignName: string, metrics: any[] = []): any[] {
  return Array.isArray(metrics) ? metrics : [];
}

export function calibrateAdSetMetricsArray(_adSetName: string, assetMetrics: any[] = []): any[] {
  return Array.isArray(assetMetrics) ? assetMetrics : [];
}

export function getCalibratedAdConversion20261111(_adName: string, _cost: number, _clicks: number): number | null {
  return null;
}

export function calibrateAdMetricsArray(_adName: string, assetMetrics: any[] = []): any[] {
  return Array.isArray(assetMetrics) ? assetMetrics : [];
}

export function calibratePeriodStatsInMemory(
  periodStats: any[] = [],
  _campaigns: any[] = [],
  _ads: any[] = [],
  _adSets: any[] = [],
  _startStr?: string,
  _endStr?: string
): any[] {
  return Array.isArray(periodStats) ? periodStats : [];
}

// Mantida por compatibilidade com chamadores existentes, agora estritamente não-destrutiva:
// nunca sobrescreve campaigns.objective por heurística de nome.
export async function ensureDatabaseCalibrated(_supabase: any, _force = false): Promise<void> {
  return;
}

const INSIGHT_WINDOWS = JSON.stringify(["7d_click", "1d_view", "1d_click", "default"]);

export async function calibrateMetaConversionsFromGraph(
  supabase: any,
  startStr: string,
  endStr: string,
  accountFilter: string = "all"
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const { data: configs } = await supabase
      .from("meta_ads_configs")
      .select("access_token")
      .not("access_token", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const token = configs?.[0]?.access_token?.trim();
    if (!token) return { ok: false, errors: ["Token Meta não encontrado."] };

    let accQuery = supabase.from("ad_accounts").select("id, name");
    if (accountFilter !== "all") accQuery = accQuery.eq("id", accountFilter);
    const { data: accounts } = await accQuery;
    if (!accounts || accounts.length === 0) return { ok: true, errors: [] };

    const accIds = accounts.map((a: any) => a.id).filter((id: string) => String(id).startsWith("act_"));
    if (accIds.length === 0) return { ok: true, errors: [] };

    const { data: dbCampaigns } = await supabase
      .from("campaigns")
      .select("id, external_id, name, objective, ad_account_id")
      .in("ad_account_id", accIds);

    const campByExt = new Map<string, any>();
    for (const c of dbCampaigns || []) {
      if (c.external_id) campByExt.set(String(c.external_id), c);
    }

    const dbCampIds = (dbCampaigns || []).map((c: any) => c.id);
    const [{ data: dbAds }, { data: dbAdSets }] = await Promise.all([
      dbCampIds.length > 0
        ? supabase.from("ads").select("id, external_id, name, campaign_id").in("campaign_id", dbCampIds)
        : Promise.resolve({ data: [] }),
      dbCampIds.length > 0
        ? supabase.from("ad_sets").select("id, external_id, name, campaign_id, optimization_goal, destination_type").in("campaign_id", dbCampIds)
        : Promise.resolve({ data: [] }),
    ]);

    const adByExt = new Map<string, any>();
    for (const a of dbAds || []) {
      if (a.external_id) adByExt.set(String(a.external_id), a);
    }

    const adSetByExt = new Map<string, any>();
    const campGoalCtx = new Map<string, { optimizationGoal: string | null; destinationType: string | null }>();
    for (const s of dbAdSets || []) {
      if (s.external_id) adSetByExt.set(String(s.external_id), s);
      if (s.campaign_id && !campGoalCtx.has(s.campaign_id)) {
        campGoalCtx.set(s.campaign_id, {
          optimizationGoal: s.optimization_goal || null,
          destinationType: s.destination_type || null,
        });
      }
    }

    const timeRangeParam = JSON.stringify({ since: startStr, until: endStr });
    const commonInsightParams = {
      time_range: timeRangeParam,
      use_unified_attribution_setting: "true",
      action_attribution_windows: INSIGHT_WINDOWS,
      limit: "500",
    };

    for (const accId of accIds) {
      try {
        const [campDailyRes, campPeriodRes, adDailyRes, adPeriodRes, adsetPeriodRes, accountPeriodRes] = await Promise.all([
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "campaign",
            fields: "campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start",
            time_increment: "1",
            ...commonInsightParams,
          }, { maxPages: 100 }),
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "campaign",
            fields: "campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start,date_stop",
            ...commonInsightParams,
          }, { maxPages: 100 }),
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "ad",
            fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start",
            time_increment: "1",
            ...commonInsightParams,
          }, { maxPages: 100 }),
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "ad",
            fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start,date_stop",
            ...commonInsightParams,
          }, { maxPages: 100 }),
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "adset",
            fields: "adset_id,adset_name,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start,date_stop",
            ...commonInsightParams,
          }, { maxPages: 100 }),
          metaFetchPaginatedWithStatus(`/${accId}/insights`, token, {
            level: "account",
            fields: "account_id,spend,reach,impressions,frequency,clicks,inline_link_clicks,actions,action_values,results,date_start,date_stop",
            ...commonInsightParams,
          }, { maxPages: 20 }),
        ]);

        for (const [label, r] of [
          ["campDaily", campDailyRes],
          ["campPeriod", campPeriodRes],
          ["adDaily", adDailyRes],
          ["adPeriod", adPeriodRes],
          ["adsetPeriod", adsetPeriodRes],
        ] as const) {
          if (!r.ok || r.truncated) {
            errors.push(`${accId}:${label}: ${r.error || "truncado"}`);
          }
        }

        // Account deduplicated period stats
        for (const row of accountPeriodRes.data) {
          const ex = extractMetaInsightMetrics(row, {});
          await supabase.from("meta_account_period_stats").upsert({
            ad_account_id: accId,
            start_date: row.date_start || startStr,
            end_date: row.date_stop || endStr,
            reach: ex.reach,
            impressions: ex.impressions,
            frequency: ex.frequency,
            spend: ex.spend,
            clicks: ex.allClicks,
            inline_link_clicks: ex.inlineLinkClicks,
            conversions: ex.resultCount ?? 0,
            purchase_value: ex.purchaseValue ?? 0,
            synced_at: new Date().toISOString(),
          }, { onConflict: "ad_account_id,start_date,end_date" }).then(() => undefined, () => undefined);
        }

        for (const row of campDailyRes.data) {
          const dbCamp = campByExt.get(String(row.campaign_id));
          if (!dbCamp) continue;
          const campCtx = campGoalCtx.get(dbCamp.id);
          const ex = extractMetaInsightMetrics(row, {
            rawObjective: row.objective || dbCamp.objective,
            optimizationGoal: row.optimization_goal || campCtx?.optimizationGoal,
            destinationType: campCtx?.destinationType,
          });
          await supabase
            .from("metrics")
            .update({
              conversions: ex.resultCount ?? 0,
              cost: ex.spend,
              reach: ex.reach,
              impressions: ex.impressions,
              clicks: ex.inlineLinkClicks,
              result_type: ex.category,
            })
            .eq("campaign_id", dbCamp.id)
            .eq("date", row.date_start);
        }

        for (const row of campPeriodRes.data) {
          const dbCamp = campByExt.get(String(row.campaign_id));
          if (!dbCamp) continue;
          const campCtx = campGoalCtx.get(dbCamp.id);
          const ex = extractMetaInsightMetrics(row, {
            rawObjective: row.objective || dbCamp.objective,
            optimizationGoal: row.optimization_goal || campCtx?.optimizationGoal,
            destinationType: campCtx?.destinationType,
          });
          await supabase
            .from("meta_period_stats")
            .update({
              conversions: ex.resultCount ?? 0,
              spend: ex.spend,
              reach: ex.reach,
              impressions: ex.impressions,
              clicks: ex.inlineLinkClicks,
            })
            .eq("entity_type", "campaign")
            .eq("entity_id", dbCamp.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }

        for (const row of adsetPeriodRes.data) {
          const dbSet = adSetByExt.get(String(row.adset_id));
          if (!dbSet) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const ex = extractMetaInsightMetrics(row, {
            rawObjective: row.objective || dbCamp?.objective,
            optimizationGoal: row.optimization_goal || dbSet.optimization_goal,
            destinationType: dbSet.destination_type,
          });
          await supabase
            .from("meta_period_stats")
            .update({
              conversions: ex.resultCount ?? 0,
              spend: ex.spend,
              reach: ex.reach,
              impressions: ex.impressions,
              clicks: ex.inlineLinkClicks,
            })
            .eq("entity_type", "adset")
            .eq("entity_id", dbSet.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }

        for (const row of adDailyRes.data) {
          const dbAd = adByExt.get(String(row.ad_id));
          if (!dbAd) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const dbSet = adSetByExt.get(String(row.adset_id));
          const ex = extractMetaInsightMetrics(row, {
            rawObjective: row.objective || dbCamp?.objective,
            optimizationGoal: row.optimization_goal || dbSet?.optimization_goal,
            destinationType: dbSet?.destination_type,
          });
          await supabase
            .from("asset_metrics")
            .update({
              conversions: ex.resultCount ?? 0,
              cost: ex.spend,
              reach: ex.reach,
              impressions: ex.impressions,
              clicks: ex.inlineLinkClicks,
            })
            .eq("ad_id", dbAd.id)
            .eq("date", row.date_start);
        }

        for (const row of adPeriodRes.data) {
          const dbAd = adByExt.get(String(row.ad_id));
          if (!dbAd) continue;
          const dbCamp = campByExt.get(String(row.campaign_id));
          const dbSet = adSetByExt.get(String(row.adset_id));
          const ex = extractMetaInsightMetrics(row, {
            rawObjective: row.objective || dbCamp?.objective,
            optimizationGoal: row.optimization_goal || dbSet?.optimization_goal,
            destinationType: dbSet?.destination_type,
          });
          await supabase
            .from("meta_period_stats")
            .update({
              conversions: ex.resultCount ?? 0,
              spend: ex.spend,
              reach: ex.reach,
              impressions: ex.impressions,
              clicks: ex.inlineLinkClicks,
            })
            .eq("entity_type", "ad")
            .eq("entity_id", dbAd.id)
            .eq("start_date", row.date_start || startStr)
            .eq("end_date", row.date_stop || endStr);
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn(`[Calibrator] Erro ao calibrar conta ${accId} via Graph API:`, msg);
        errors.push(`${accId}: ${msg}`);
      }
    }

    return { ok: errors.length === 0, errors };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn("[Calibrator] Erro geral na calibração direta:", msg);
    return { ok: false, errors: [msg] };
  }
}
