import { format, parseISO, subDays, addDays, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase-external/client";

const META_API_BASE = "https://graph.facebook.com/v21.0";

export interface RealSocialAccount {
  page_id: string;
  page_name: string;
  access_token: string;
  facebook_followers: number;
  instagram_account_id: string | null;
  instagram_handle: string | null;
  instagram_followers: number;
  profile_picture_url?: string | null;
}

export interface RealDailyPoint {
  date: string;
  label: string;
  reachIg: number;
  newFollowersIg: number;
  newFollowersFb: number;
  viewsFb: number;
  engFb: number;
  isSelectedRange: boolean;
}

export interface RealSocialPost {
  id: string;
  accountName: string;
  accountHandle: string;
  title: string;
  content: string;
  post_type: "reels" | "image" | "carousel" | "stories";
  media_product_type?: string;
  platform: "instagram" | "facebook";
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saved_count: number;
  reach_count: number;
  views_count: number;
  total_interactions: number;
  engagement_rate: number;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  ai_sentiment: string;
  ai_recommendation: string;
}

export interface RealDemographics {
  available: boolean;
  totalSample: number;
  gender: { male: number; female: number };
  age: { range: string; male: number; female: number }[];
}

export interface RealSocialInsightsResult {
  accounts: RealSocialAccount[];
  dailySeries: RealDailyPoint[];
  chartWindowDays: number;
  kpis: {
    followersIg: number;
    followersFb: number;
    newFollowersIg: number;
    newFollowersFb: number;
    reachIg: number;
    viewsIg: number;
    viewsFb: number;
    interactionsIg: number;
    interactionsFb: number;
    accountsEngaged: number;
    profileViews: number;
    websiteClicks: number;
    reachDeltaPct: number | null;
    followersDeltaPct: number | null;
  };
  demographics: RealDemographics;
  posts: RealSocialPost[];
  heatmapMatrix: number[][];
  hasPostsForHeatmap: boolean;
  syncSource: "meta_graph_v21" | "no_token" | "api_error";
  errorMessage?: string;
}

async function fetchMetaJson(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err: any) {
    return { error: { message: err?.message || "Erro de rede ao consultar Meta API" } };
  }
}

export async function getActiveMasterMetaToken(): Promise<string | null> {
  const { data } = await supabase
    .from("meta_ads_configs")
    .select("access_token")
    .not("access_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const token = (data as any)?.access_token;
  if (!token || token.startsWith("mock_") || token.length < 20) return null;
  return token;
}

/**
 * Busca as contas reais conectadas diretamente no Meta Graph API (/me/accounts)
 * usando o token ativo e faz fallback seguro para `social_pages` caso /me/accounts não responda.
 */
export async function fetchLiveSocialAccounts(syncToDb = false): Promise<{
  accounts: RealSocialAccount[];
  masterToken: string | null;
  error?: string;
}> {
  const masterToken = await getActiveMasterMetaToken();

  const { data: dbPages } = await supabase
    .from("social_pages")
    .select("*")
    .order("page_name");

  if (!masterToken) {
    const mappedDb = ((dbPages || []) as any[])
      .filter((p) => p.page_id && !String(p.page_id).startsWith("mock_"))
      .map((p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        access_token: p.access_token || "",
        facebook_followers: Number(p.facebook_followers || 0),
        instagram_account_id: p.instagram_account_id || null,
        instagram_handle: p.instagram_handle || null,
        instagram_followers: Number(p.instagram_followers || 0),
        profile_picture_url: null,
      }));
    return {
      accounts: mappedDb,
      masterToken: null,
      error: "Token Master da Meta não configurado em Configurações → Integrações Master.",
    };
  }

  const meRes = await fetchMetaJson(
    `${META_API_BASE}/me/accounts?fields=id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,profile_picture_url}&limit=100&access_token=${encodeURIComponent(masterToken)}`
  );

  if (meRes?.error || !Array.isArray(meRes?.data)) {
    const mappedDb = ((dbPages || []) as any[])
      .filter((p) => p.page_id && !String(p.page_id).startsWith("mock_"))
      .map((p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        access_token: p.access_token || masterToken,
        facebook_followers: Number(p.facebook_followers || 0),
        instagram_account_id: p.instagram_account_id || null,
        instagram_handle: p.instagram_handle || null,
        instagram_followers: Number(p.instagram_followers || 0),
        profile_picture_url: null,
      }));
    return {
      accounts: mappedDb,
      masterToken,
      error: meRes?.error?.message || "Não foi possível consultar páginas conectadas no Meta.",
    };
  }

  const accounts: RealSocialAccount[] = meRes.data.map((p: any) => ({
    page_id: p.id,
    page_name: p.name,
    access_token: p.access_token || masterToken,
    facebook_followers: Number(p.followers_count ?? p.fan_count ?? 0),
    instagram_account_id: p.instagram_business_account?.id || null,
    instagram_handle: p.instagram_business_account?.username || null,
    instagram_followers: Number(p.instagram_business_account?.followers_count ?? 0),
    profile_picture_url: p.instagram_business_account?.profile_picture_url || null,
  }));

  accounts.sort((a, b) => (b.instagram_followers + b.facebook_followers) - (a.instagram_followers + a.facebook_followers));

  if (syncToDb && accounts.length > 0) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        for (const acc of accounts) {
          await (supabase as any).from("social_pages").upsert(
            {
              user_id: userId,
              page_id: acc.page_id,
              page_name: acc.page_name,
              instagram_account_id: acc.instagram_account_id,
              instagram_handle: acc.instagram_handle,
              access_token: acc.access_token,
              facebook_followers: acc.facebook_followers,
              instagram_followers: acc.instagram_followers,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "page_id" }
          );
        }
      }
    } catch {
      // ignora erro de permissão de escrita (ex: usuário leitura)
    }
  }

  return { accounts, masterToken };
}

function parseDemographicsFromApi(demoRes: any): RealDemographics {
  const empty: RealDemographics = {
    available: false,
    totalSample: 0,
    gender: { male: 0, female: 0 },
    age: [],
  };

  const results = demoRes?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results) || results.length === 0) return empty;

  const buckets: Record<string, { male: number; female: number }> = {
    "18-24": { male: 0, female: 0 },
    "25-34": { male: 0, female: 0 },
    "35-44": { male: 0, female: 0 },
    "45-54": { male: 0, female: 0 },
    "55+": { male: 0, female: 0 },
  };

  let totalMale = 0;
  let totalFemale = 0;
  let totalAll = 0;

  for (const row of results) {
    const [ageKeyRaw, genderKey] = row.dimension_values || [];
    const val = Number(row.value || 0);
    if (val <= 0) continue;

    let bucketKey = ageKeyRaw;
    if (ageKeyRaw === "55-64" || ageKeyRaw === "65+") bucketKey = "55+";
    if (!buckets[bucketKey]) continue;

    if (genderKey === "M") {
      buckets[bucketKey].male += val;
      totalMale += val;
      totalAll += val;
    } else if (genderKey === "F") {
      buckets[bucketKey].female += val;
      totalFemale += val;
      totalAll += val;
    }
  }

  if (totalAll === 0) return empty;

  const malePct = Math.round((totalMale / totalAll) * 100);
  const femalePct = 100 - malePct;

  const ageArr = Object.entries(buckets).map(([range, counts]) => ({
    range,
    male: Math.round((counts.male / totalAll) * 100),
    female: Math.round((counts.female / totalAll) * 100),
  }));

  return {
    available: true,
    totalSample: totalAll,
    gender: { male: malePct, female: femalePct },
    age: ageArr,
  };
}

function classifyPostRecommendation(post: {
  mediaType: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  caption: string;
}) {
  const interactions = post.likes + post.comments + post.shares + post.saved;
  const eng = post.reach > 0 ? interactions / post.reach : 0;

  if (post.reach === 0 && interactions === 0) {
    return {
      sentiment: "Recente / Em Coleta",
      recommendation: "Publicação recente com volume ainda em consolidação pela Meta API. Acompanhe nas próximas 24h.",
    };
  }
  if (eng >= 0.06 || post.shares >= 3 || post.saved >= 3) {
    return {
      sentiment: "Altamente Engajador",
      recommendation: `Taxa de ${(eng * 100).toFixed(1)}% (${post.shares} compartilhamentos e ${post.saved} salvamentos). Excelente candidato para impulsionamento local no Meta Ads.`,
    };
  }
  if (/preço|parcela|fipe|oferta|seminovo|ipva|zero|entrada|whatsapp|chama/i.test(post.caption)) {
    return {
      sentiment: "Foco Comercial",
      recommendation: `Publicação de oferta direta com ${post.views.toLocaleString("pt-BR")} visualizações e ${post.comments} comentários. Priorize resposta rápida no Direct/WhatsApp.`,
    };
  }
  return {
    sentiment: "Engajamento Orgânico",
    recommendation: `Alcançou ${post.reach.toLocaleString("pt-BR")} pessoas com ${post.views.toLocaleString("pt-BR")} visualizações. Teste gancho mais forte nos 3 primeiros segundos para elevar compartilhamentos.`,
  };
}

function buildRealHeatmap(posts: RealSocialPost[]): { matrix: number[][]; hasData: boolean } {
  const sums: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let totalWeight = 0;

  for (const p of posts) {
    if (!p.published_at) continue;
    const dt = new Date(p.published_at);
    if (isNaN(dt.getTime())) continue;
    const day = dt.getDay();
    const hour = dt.getHours();
    const score = Math.max(1, p.likes_count + p.comments_count * 2 + p.shares_count * 3 + p.saved_count * 2 + Math.round(p.reach_count / 100));
    sums[day][hour] += score;
    counts[day][hour] += 1;
    totalWeight += score;
  }

  if (totalWeight === 0) {
    return { matrix: sums, hasData: false };
  }

  let maxVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const avg = counts[d][h] > 0 ? sums[d][h] / counts[d][h] : 0;
      sums[d][h] = avg;
      if (avg > maxVal) maxVal = avg;
    }
  }

  const normalized = sums.map((row) =>
    row.map((v) => (maxVal > 0 && v > 0 ? Math.max(0.18, Number((v / maxVal).toFixed(2))) : 0))
  );

  return { matrix: normalized, hasData: true };
}

/**
 * Busca dados 100% REAIS do Meta Graph API v21.0 para uma conta específica ou consolidação real das contas conectadas.
 */
export async function fetchRealSocialInsights(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  dateFrom: string;
  dateTo: string;
  chartDaysOverride?: number;
  masterToken: string | null;
}): Promise<RealSocialInsightsResult> {
  const { accounts, selectedPageId, dateFrom, dateTo, chartDaysOverride, masterToken } = params;

  const emptyResult: RealSocialInsightsResult = {
    accounts,
    dailySeries: [],
    chartWindowDays: 14,
    kpis: {
      followersIg: 0,
      followersFb: 0,
      newFollowersIg: 0,
      newFollowersFb: 0,
      reachIg: 0,
      viewsIg: 0,
      viewsFb: 0,
      interactionsIg: 0,
      interactionsFb: 0,
      accountsEngaged: 0,
      profileViews: 0,
      websiteClicks: 0,
      reachDeltaPct: null,
      followersDeltaPct: null,
    },
    demographics: { available: false, totalSample: 0, gender: { male: 0, female: 0 }, age: [] },
    posts: [],
    heatmapMatrix: Array.from({ length: 7 }, () => Array(24).fill(0)),
    hasPostsForHeatmap: false,
    syncSource: masterToken ? "meta_graph_v21" : "no_token",
  };

  if (!masterToken || accounts.length === 0) {
    return {
      ...emptyResult,
      errorMessage: masterToken
        ? "Nenhuma página conectada encontrada no Token Meta."
        : "Token de acesso da Meta não configurado.",
    };
  }

  // Resolver alvo(s)
  let targetAccounts: RealSocialAccount[] = [];
  if (selectedPageId === "all") {
    // Limita em até 8 principais contas com IG/seguidores para manter resposta rápida e precisa
    targetAccounts = accounts.slice(0, 8);
  } else {
    const matched = accounts.find((a) => a.page_id === selectedPageId || a.instagram_account_id === selectedPageId);
    if (matched) targetAccounts = [matched];
    else targetAccounts = [accounts[0]];
  }

  const endDateObj = parseISO(dateTo);
  const startDateObj = parseISO(dateFrom);
  const selectedDaysCount = Math.max(1, differenceInCalendarDays(endDateObj, startDateObj) + 1);
  const chartDays = chartDaysOverride || Math.max(14, selectedDaysCount);
  const chartStartDate = subDays(endDateObj, chartDays - 1);

  const chartSince = format(chartStartDate, "yyyy-MM-dd");
  const kpiSince = dateFrom;
  const untilExclusive = format(addDays(endDateObj, 1), "yyyy-MM-dd");

  // Mapa diário preenchido com todas as datas da janela do gráfico
  const dailyMap = new Map<string, RealDailyPoint>();
  for (let i = 0; i < chartDays; i++) {
    const d = addDays(chartStartDate, i);
    const iso = format(d, "yyyy-MM-dd");
    dailyMap.set(iso, {
      date: iso,
      label: format(d, "dd/MM"),
      reachIg: 0,
      newFollowersIg: 0,
      newFollowersFb: 0,
      viewsFb: 0,
      engFb: 0,
      isSelectedRange: iso >= dateFrom && iso <= dateTo,
    });
  }

  let followersIg = 0;
  let followersFb = 0;
  let newFollowersIg = 0;
  let newFollowersFb = 0;
  let reachIg = 0;
  let viewsIg = 0;
  let viewsFb = 0;
  let interactionsIg = 0;
  let interactionsFb = 0;
  let accountsEngaged = 0;
  let profileViews = 0;
  let websiteClicks = 0;

  const allPosts: RealSocialPost[] = [];
  const demoTotals = {
    available: false,
    totalSample: 0,
    male: 0,
    female: 0,
    ageMap: new Map<string, { male: number; female: number }>(),
  };

  await Promise.all(
    targetAccounts.map(async (acc) => {
      followersIg += acc.instagram_followers || 0;
      followersFb += acc.facebook_followers || 0;
      const pageToken = acc.access_token || masterToken;

      // 1. Insights & Mídias reais do Instagram
      if (acc.instagram_account_id) {
        const igId = acc.instagram_account_id;
        const [igTsRes, igTotalsRes, igDemoRes, igMediaRes] = await Promise.all([
          fetchMetaJson(
            `${META_API_BASE}/${igId}/insights?metric=reach,follower_count&period=day&since=${chartSince}&until=${untilExclusive}&access_token=${encodeURIComponent(masterToken)}`
          ),
          fetchMetaJson(
            `${META_API_BASE}/${igId}/insights?metric=views,total_interactions,accounts_engaged,profile_views,website_clicks&metric_type=total_value&period=day&since=${kpiSince}&until=${untilExclusive}&access_token=${encodeURIComponent(masterToken)}`
          ),
          fetchMetaJson(
            `${META_API_BASE}/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender&access_token=${encodeURIComponent(masterToken)}`
          ),
          fetchMetaJson(
            `${META_API_BASE}/${igId}/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=${selectedPageId === "all" ? 6 : 18}&access_token=${encodeURIComponent(masterToken)}`
          ),
        ]);

        // Time-series diário IG
        if (Array.isArray(igTsRes?.data)) {
          for (const metric of igTsRes.data) {
            for (const v of metric.values || []) {
              const dayIso = String(v.end_time || "").slice(0, 10);
              const val = Number(v.value || 0);
              const entry = dailyMap.get(dayIso);
              if (entry) {
                if (metric.name === "reach") entry.reachIg += val;
                if (metric.name === "follower_count") entry.newFollowersIg += val;
              }
              if (dayIso >= dateFrom && dayIso <= dateTo) {
                if (metric.name === "reach") reachIg += val;
                if (metric.name === "follower_count") newFollowersIg += val;
              }
            }
          }
        }

        // Totais exatos do período IG
        if (Array.isArray(igTotalsRes?.data)) {
          for (const m of igTotalsRes.data) {
            const val = Number(m.total_value?.value || 0);
            if (m.name === "views") viewsIg += val;
            if (m.name === "total_interactions") interactionsIg += val;
            if (m.name === "accounts_engaged") accountsEngaged += val;
            if (m.name === "profile_views") profileViews += val;
            if (m.name === "website_clicks") websiteClicks += val;
          }
        }

        // Demográficos reais
        const parsedDemo = parseDemographicsFromApi(igDemoRes);
        if (parsedDemo.available) {
          demoTotals.available = true;
          demoTotals.totalSample += parsedDemo.totalSample;
          const rawResults = igDemoRes?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
          for (const r of rawResults) {
            const [ageRaw, gKey] = r.dimension_values || [];
            const val = Number(r.value || 0);
            if (val <= 0) continue;
            let ageBucket = ageRaw;
            if (ageRaw === "55-64" || ageRaw === "65+") ageBucket = "55+";
            if (!["18-24", "25-34", "35-44", "45-54", "55+"].includes(ageBucket)) continue;
            const cur = demoTotals.ageMap.get(ageBucket) || { male: 0, female: 0 };
            if (gKey === "M") {
              cur.male += val;
              demoTotals.male += val;
            } else if (gKey === "F") {
              cur.female += val;
              demoTotals.female += val;
            }
            demoTotals.ageMap.set(ageBucket, cur);
          }
        }

        // Posts reais do Instagram + métricas individuais reais (sem multiplicadores fictícios)
        const mediaItems = Array.isArray(igMediaRes?.data) ? igMediaRes.data : [];
        const topMedia = mediaItems.slice(0, selectedPageId === "all" ? 5 : 15);

        await Promise.all(
          topMedia.map(async (item: any) => {
            let pReach = 0;
            let pViews = 0;
            let pSaved = 0;
            let pShares = 0;
            let pInteractions = 0;

            const ins = await fetchMetaJson(
              `${META_API_BASE}/${item.id}/insights?metric=reach,views,saved,shares,total_interactions&access_token=${encodeURIComponent(masterToken)}`
            );
            if (Array.isArray(ins?.data)) {
              for (const m of ins.data) {
                const v = Number(m.values?.[0]?.value || 0);
                if (m.name === "reach") pReach = v;
                if (m.name === "views") pViews = v;
                if (m.name === "saved") pSaved = v;
                if (m.name === "shares") pShares = v;
                if (m.name === "total_interactions") pInteractions = v;
              }
            }

            const likes = Number(item.like_count || 0);
            const comments = Number(item.comments_count || 0);
            const totalInt = pInteractions || likes + comments + pSaved + pShares;
            const engRate = pReach > 0 ? (totalInt / pReach) * 100 : 0;

            const isReel =
              item.media_product_type === "REELS" ||
              item.media_type === "VIDEO";
            const postType: RealSocialPost["post_type"] = isReel
              ? "reels"
              : item.media_type === "CAROUSEL_ALBUM"
              ? "carousel"
              : item.media_product_type === "STORY"
              ? "stories"
              : "image";

            const caption = item.caption || "";
            const firstLine = caption.split("\n").find((l: string) => l.trim()) || `Publicação ${postType.toUpperCase()}`;
            const { sentiment, recommendation } = classifyPostRecommendation({
              mediaType: item.media_type,
              reach: pReach,
              views: pViews,
              likes,
              comments,
              shares: pShares,
              saved: pSaved,
              caption,
            });

            allPosts.push({
              id: item.id,
              accountName: acc.page_name,
              accountHandle: acc.instagram_handle ? `@${acc.instagram_handle}` : acc.page_name,
              title: firstLine.length > 52 ? firstLine.slice(0, 49) + "..." : firstLine,
              content: caption,
              post_type: postType,
              media_product_type: item.media_product_type,
              platform: "instagram",
              likes_count: likes,
              comments_count: comments,
              shares_count: pShares,
              saved_count: pSaved,
              reach_count: pReach,
              views_count: pViews,
              total_interactions: totalInt,
              engagement_rate: engRate,
              media_url: item.media_url || null,
              thumbnail_url: item.thumbnail_url || item.media_url || null,
              permalink: item.permalink || null,
              published_at: item.timestamp,
              ai_sentiment: sentiment,
              ai_recommendation: recommendation,
            });
          })
        );
      }

      // 2. Insights & Postagens reais do Facebook Page
      const [fbInsRes, fbPostsRes] = await Promise.all([
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/insights?metric=page_views_total,page_post_engagements,page_daily_follows&period=day&since=${chartSince}&until=${untilExclusive}&access_token=${encodeURIComponent(pageToken)}`
        ),
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/posts?fields=id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares&limit=${selectedPageId === "all" ? 4 : 12}&access_token=${encodeURIComponent(pageToken)}`
        ),
      ]);

      if (Array.isArray(fbInsRes?.data)) {
        for (const metric of fbInsRes.data) {
          for (const v of metric.values || []) {
            const dayIso = String(v.end_time || "").slice(0, 10);
            const val = Number(v.value || 0);
            const entry = dailyMap.get(dayIso);
            if (entry) {
              if (metric.name === "page_views_total") entry.viewsFb += val;
              if (metric.name === "page_post_engagements") entry.engFb += val;
              if (metric.name === "page_daily_follows") entry.newFollowersFb += val;
            }
            if (dayIso >= dateFrom && dayIso <= dateTo) {
              if (metric.name === "page_views_total") viewsFb += val;
              if (metric.name === "page_post_engagements") interactionsFb += val;
              if (metric.name === "page_daily_follows") newFollowersFb += val;
            }
          }
        }
      }

      const fbPosts = Array.isArray(fbPostsRes?.data) ? fbPostsRes.data : [];
      for (const fp of fbPosts) {
        const likes = Number(fp.likes?.summary?.total_count || 0);
        const comments = Number(fp.comments?.summary?.total_count || 0);
        const shares = Number(fp.shares?.count || 0);
        const msg = fp.message || "";
        const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Publicação no Facebook";

        allPosts.push({
          id: `fb_${fp.id}`,
          accountName: acc.page_name,
          accountHandle: acc.page_name,
          title: firstLine.length > 52 ? firstLine.slice(0, 49) + "..." : firstLine,
          content: msg,
          post_type: "image",
          platform: "facebook",
          likes_count: likes,
          comments_count: comments,
          shares_count: shares,
          saved_count: 0,
          reach_count: 0,
          views_count: 0,
          total_interactions: likes + comments + shares,
          engagement_rate: 0,
          media_url: fp.full_picture || null,
          thumbnail_url: fp.full_picture || null,
          permalink: fp.permalink_url || `https://facebook.com/${fp.id}`,
          published_at: fp.created_time,
          ai_sentiment: likes + comments + shares > 0 ? "Engajamento Orgânico" : "Institucional Facebook",
          ai_recommendation:
            likes + comments + shares > 0
              ? `${likes} reações, ${comments} comentários e ${shares} compartilhamentos no Facebook.`
              : "Publicação ativa na Página do Facebook.",
        });
      }
    })
  );

  // Ordenar série diária cronologicamente
  const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Calcular deltas reais comparando período selecionado vs janela imediatamente anterior dentro da série
  let reachDeltaPct: number | null = null;
  let followersDeltaPct: number | null = null;
  if (dailySeries.length >= selectedDaysCount * 2) {
    const prevSlice = dailySeries.slice(dailySeries.length - selectedDaysCount * 2, dailySeries.length - selectedDaysCount);
    const prevReach = prevSlice.reduce((s, d) => s + d.reachIg, 0);
    const prevFollowers = prevSlice.reduce((s, d) => s + d.newFollowersIg + d.newFollowersFb, 0);
    if (prevReach > 0) {
      reachDeltaPct = Number((((reachIg - prevReach) / prevReach) * 100).toFixed(1));
    }
    if (prevFollowers > 0) {
      followersDeltaPct = Number((((newFollowersIg + newFollowersFb - prevFollowers) / prevFollowers) * 100).toFixed(1));
    }
  }

  // Montar demográficos consolidados reais
  let demographics: RealDemographics = { available: false, totalSample: 0, gender: { male: 0, female: 0 }, age: [] };
  const totalGender = demoTotals.male + demoTotals.female;
  if (demoTotals.available && totalGender > 0) {
    const malePct = Math.round((demoTotals.male / totalGender) * 100);
    demographics = {
      available: true,
      totalSample: totalGender,
      gender: { male: malePct, female: 100 - malePct },
      age: ["18-24", "25-34", "35-44", "45-54", "55+"].map((range) => {
        const b = demoTotals.ageMap.get(range) || { male: 0, female: 0 };
        return {
          range,
          male: Math.round((b.male / totalGender) * 100),
          female: Math.round((b.female / totalGender) * 100),
        };
      }),
    };
  }

  // Heatmap real a partir dos posts reais
  const { matrix: heatmapMatrix, hasData: hasPostsForHeatmap } = buildRealHeatmap(allPosts);

  return {
    accounts,
    dailySeries,
    chartWindowDays: chartDays,
    kpis: {
      followersIg,
      followersFb,
      newFollowersIg,
      newFollowersFb,
      reachIg,
      viewsIg,
      viewsFb,
      interactionsIg,
      interactionsFb,
      accountsEngaged,
      profileViews,
      websiteClicks,
      reachDeltaPct,
      followersDeltaPct,
    },
    demographics,
    posts: allPosts,
    heatmapMatrix,
    hasPostsForHeatmap,
    syncSource: "meta_graph_v21",
  };
}

export interface PlannerPost {
  id: string;
  user_id?: string;
  page_id?: string;
  account_name?: string;
  account_handle?: string;
  title: string;
  content: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink?: string | null;
  post_type: "feed" | "reels" | "stories" | "carousel";
  status: "draft" | "pending_approval" | "scheduled" | "published" | "failed";
  platform: "instagram" | "facebook" | "both";
  scheduled_at?: string | null;
  published_at?: string | null;
  meta_post_id?: string | null;
  error_message?: string | null;
  likes_count: number;
  comments_count: number;
  reach_count: number;
  impressions_count: number;
  shares_count?: number;
  saves_count?: number;
  created_at: string;
  source: "meta_live" | "supabase";
}

export interface RealIgProfileDetails {
  id: string;
  username: string;
  name: string;
  biography: string;
  website: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string | null;
}

export interface BestSlotItem {
  dayIdx: number;
  dayName: string;
  hour: number;
  score: number;
  postsCount: number;
}

export interface PlannerSyncResult {
  posts: PlannerPost[];
  igProfile: RealIgProfileDetails | null;
  heatmapMatrix: number[][];
  hasPostsForHeatmap: boolean;
  topTimeSlots: BestSlotItem[];
  metaScheduledCount: number;
  metaPublishedCount: number;
  errorMessage?: string;
}

function parseMetaTimestampToIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const str = String(raw).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractFbAttachmentInfo(fp: any): { mediaUrl: string | null; postType: PlannerPost["post_type"] } {
  const att = fp?.attachments?.data?.[0];
  const mediaType = String(att?.media_type || att?.type || "").toLowerCase();
  const imgSrc =
    fp?.full_picture ||
    att?.media?.image?.src ||
    att?.subattachments?.data?.[0]?.media?.image?.src ||
    null;

  let postType: PlannerPost["post_type"] = "feed";
  if (mediaType.includes("video") || mediaType.includes("reel")) {
    postType = "reels";
  } else if (mediaType.includes("album") || (att?.subattachments?.data?.length || 0) > 1) {
    postType = "carousel";
  }
  return { mediaUrl: imgSrc, postType };
}

const WEEK_DAY_NAMES_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Busca todos os posts REAIS agendados no Meta (/{page}/scheduled_posts e promotable_posts com data agendada),
 * todos os posts REAIS já publicados (IG media, IG stories e FB Page posts) e mescla sem duplicar com `social_posts`.
 */
export async function fetchRealPlannerPosts(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  masterToken: string | null;
}): Promise<PlannerSyncResult> {
  const { accounts, selectedPageId, masterToken } = params;

  const emptyHeatmap = Array.from({ length: 7 }, () => Array(24).fill(0));

  // 1. Buscar posts reais salvos no Supabase (`social_posts`), removendo resíduos mock
  let dbRows: PlannerPost[] = [];
  try {
    let q = supabase.from("social_posts").select("*").order("created_at", { ascending: false });
    if (selectedPageId !== "all") {
      q = q.eq("page_id", selectedPageId);
    }
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      dbRows = data
        .filter(
          (row: any) =>
            row.id &&
            !String(row.id).startsWith("sample-") &&
            !String(row.meta_post_id || "").startsWith("mock_")
        )
        .map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          page_id: row.page_id,
          title: row.title || (row.content ? String(row.content).slice(0, 48) : "Publicação"),
          content: row.content || "",
          media_url: row.media_url || null,
          thumbnail_url: row.media_url || null,
          permalink: null,
          post_type: (row.post_type || "feed") as PlannerPost["post_type"],
          status: (row.status || "draft") as PlannerPost["status"],
          platform: (row.platform || "instagram") as PlannerPost["platform"],
          scheduled_at: row.scheduled_at || null,
          published_at: row.published_at || null,
          meta_post_id: row.meta_post_id || null,
          error_message: row.error_message || null,
          likes_count: Number(row.likes_count || 0),
          comments_count: Number(row.comments_count || 0),
          reach_count: Number(row.reach_count || 0),
          impressions_count: Number(row.impressions_count || 0),
          created_at: row.created_at || new Date().toISOString(),
          source: "supabase" as const,
        }));
    }
  } catch {
    // mantém vazio se tabela estiver indisponível
  }

  if (!masterToken || accounts.length === 0) {
    return {
      posts: dbRows,
      igProfile: null,
      heatmapMatrix: emptyHeatmap,
      hasPostsForHeatmap: false,
      topTimeSlots: [],
      metaScheduledCount: 0,
      metaPublishedCount: 0,
      errorMessage: masterToken
        ? "Nenhuma página conectada encontrada no Meta."
        : "Token Master da Meta não configurado.",
    };
  }

  const isSingle = selectedPageId !== "all";
  const targetAccounts = isSingle
    ? accounts.filter((a) => a.page_id === selectedPageId || a.instagram_account_id === selectedPageId)
    : accounts.slice(0, 10);

  if (targetAccounts.length === 0) {
    return {
      posts: dbRows,
      igProfile: null,
      heatmapMatrix: emptyHeatmap,
      hasPostsForHeatmap: false,
      topTimeSlots: [],
      metaScheduledCount: 0,
      metaPublishedCount: 0,
    };
  }

  // Perfil completo real do Instagram (para o Feed Planner 3x3)
  let igProfile: RealIgProfileDetails | null = null;
  const igTarget = targetAccounts.find((a) => a.instagram_account_id) || null;
  if (igTarget?.instagram_account_id) {
    const profRes = await fetchMetaJson(
      `${META_API_BASE}/${igTarget.instagram_account_id}?fields=id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url&access_token=${encodeURIComponent(masterToken)}`
    );
    if (profRes && !profRes.error && profRes.id) {
      igProfile = {
        id: profRes.id,
        username: profRes.username || igTarget.instagram_handle || "",
        name: profRes.name || igTarget.page_name,
        biography: profRes.biography || "",
        website: profRes.website || "",
        followers_count: Number(profRes.followers_count ?? igTarget.instagram_followers ?? 0),
        follows_count: Number(profRes.follows_count ?? 0),
        media_count: Number(profRes.media_count ?? 0),
        profile_picture_url: profRes.profile_picture_url || igTarget.profile_picture_url || null,
      };
    }
  }

  const metaPosts: PlannerPost[] = [];
  const metaByMetaId = new Map<string, PlannerPost>();
  let metaScheduledCount = 0;
  let metaPublishedCount = 0;

  await Promise.all(
    targetAccounts.map(async (acc) => {
      const pageToken = acc.access_token || masterToken;
      const fbLimit = isSingle ? 45 : 12;
      const igLimit = isSingle ? 50 : 15;

      // 1) Agendados no Meta (Facebook Page scheduled_posts + promotable_posts com scheduled_publish_time)
      // 2) Publicados no Facebook (/posts)
      // 3) Publicados no Instagram (/media) + Stories ativos (/stories)
      const [fbSchedRes, fbPromoRes, fbPubRes, igMediaRes, igStoriesRes] = await Promise.all([
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/scheduled_posts?fields=id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published,attachments{media_type,type,url,media{image{src}},subattachments{media{image{src}}}}&limit=50&access_token=${encodeURIComponent(pageToken)}`
        ),
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/promotable_posts?is_published=false&fields=id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published,attachments{media_type,type,url,media{image{src}},subattachments{media{image{src}}}}&limit=50&access_token=${encodeURIComponent(pageToken)}`
        ),
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/posts?fields=id,message,created_time,full_picture,permalink_url,attachments{media_type,type,media{image{src}},subattachments{media{image{src}}}},likes.summary(true),comments.summary(true),shares&limit=${fbLimit}&access_token=${encodeURIComponent(pageToken)}`
        ),
        acc.instagram_account_id
          ? fetchMetaJson(
              `${META_API_BASE}/${acc.instagram_account_id}/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=${igLimit}&access_token=${encodeURIComponent(masterToken)}`
            )
          : Promise.resolve(null),
        acc.instagram_account_id
          ? fetchMetaJson(
              `${META_API_BASE}/${acc.instagram_account_id}/stories?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25&access_token=${encodeURIComponent(masterToken)}`
            )
          : Promise.resolve(null),
      ]);

      // Mesclar agendados reais do Meta (scheduled_posts + promotable_posts com scheduled_publish_time)
      const rawScheduled = [
        ...(Array.isArray(fbSchedRes?.data) ? fbSchedRes.data : []),
        ...(Array.isArray(fbPromoRes?.data) ? fbPromoRes.data.filter((x: any) => x?.scheduled_publish_time) : []),
      ];
      const seenFbSchedIds = new Set<string>();
      for (const sp of rawScheduled) {
        if (!sp?.id || seenFbSchedIds.has(sp.id)) continue;
        seenFbSchedIds.add(sp.id);
        const schedIso = parseMetaTimestampToIso(sp.scheduled_publish_time);
        if (!schedIso) continue;
        const { mediaUrl, postType } = extractFbAttachmentInfo(sp);
        const msg = sp.message || "";
        const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Post Agendado no Meta";
        const item: PlannerPost = {
          id: `meta_sched_${sp.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: msg || "Publicação agendada diretamente no Meta Business Suite.",
          media_url: mediaUrl,
          thumbnail_url: mediaUrl,
          permalink: sp.permalink_url || null,
          post_type: postType,
          status: "scheduled",
          platform: "facebook",
          scheduled_at: schedIso,
          published_at: null,
          meta_post_id: sp.id,
          likes_count: 0,
          comments_count: 0,
          reach_count: 0,
          impressions_count: 0,
          created_at: sp.created_time || schedIso,
          source: "meta_live",
        };
        metaScheduledCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(sp.id, item);
      }

      // Posts publicados do Facebook
      const fbPubList = Array.isArray(fbPubRes?.data) ? fbPubRes.data : [];
      for (const fp of fbPubList) {
        if (!fp?.id) continue;
        const { mediaUrl, postType } = extractFbAttachmentInfo(fp);
        const msg = fp.message || "";
        const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Publicação no Facebook";
        const likes = Number(fp.likes?.summary?.total_count || 0);
        const comments = Number(fp.comments?.summary?.total_count || 0);
        const shares = Number(fp.shares?.count || 0);
        const item: PlannerPost = {
          id: `meta_fb_${fp.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: msg,
          media_url: mediaUrl,
          thumbnail_url: mediaUrl,
          permalink: fp.permalink_url || `https://facebook.com/${fp.id}`,
          post_type: postType,
          status: "published",
          platform: "facebook",
          scheduled_at: null,
          published_at: fp.created_time,
          meta_post_id: fp.id,
          likes_count: likes,
          comments_count: comments,
          shares_count: shares,
          reach_count: 0,
          impressions_count: 0,
          created_at: fp.created_time,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(fp.id, item);
      }

      // Posts publicados no Instagram + enriquecimento de métricas reais nos mais recentes
      const igList = Array.isArray(igMediaRes?.data) ? igMediaRes.data : [];
      const enrichCount = isSingle ? Math.min(20, igList.length) : Math.min(5, igList.length);

      const igInsightsMap = new Map<string, { reach: number; views: number; saved: number; shares: number }>();
      await Promise.all(
        igList.slice(0, enrichCount).map(async (mItem: any) => {
          const ins = await fetchMetaJson(
            `${META_API_BASE}/${mItem.id}/insights?metric=reach,views,saved,shares&access_token=${encodeURIComponent(masterToken)}`
          );
          let reach = 0;
          let views = 0;
          let saved = 0;
          let shares = 0;
          if (Array.isArray(ins?.data)) {
            for (const met of ins.data) {
              const v = Number(met.values?.[0]?.value || 0);
              if (met.name === "reach") reach = v;
              if (met.name === "views") views = v;
              if (met.name === "saved") saved = v;
              if (met.name === "shares") shares = v;
            }
          }
          igInsightsMap.set(mItem.id, { reach, views, saved, shares });
        })
      );

      for (const igItem of igList) {
        if (!igItem?.id) continue;
        const caption = igItem.caption || "";
        const firstLine = caption.split("\n").find((l: string) => l.trim()) || `Instagram ${igItem.media_type || "Post"}`;
        const isReel = igItem.media_product_type === "REELS" || igItem.media_type === "VIDEO";
        const postType: PlannerPost["post_type"] = isReel
          ? "reels"
          : igItem.media_type === "CAROUSEL_ALBUM"
          ? "carousel"
          : igItem.media_product_type === "STORY"
          ? "stories"
          : "feed";
        const metrics = igInsightsMap.get(igItem.id);
        const item: PlannerPost = {
          id: `meta_ig_${igItem.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: caption,
          media_url: igItem.thumbnail_url || igItem.media_url || null,
          thumbnail_url: igItem.thumbnail_url || igItem.media_url || null,
          permalink: igItem.permalink || null,
          post_type: postType,
          status: "published",
          platform: "instagram",
          scheduled_at: null,
          published_at: igItem.timestamp,
          meta_post_id: igItem.id,
          likes_count: Number(igItem.like_count || 0),
          comments_count: Number(igItem.comments_count || 0),
          shares_count: metrics?.shares || 0,
          saves_count: metrics?.saved || 0,
          reach_count: metrics?.reach || 0,
          impressions_count: metrics?.views || 0,
          created_at: igItem.timestamp,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(igItem.id, item);
      }

      // Stories ativos no Instagram
      const storiesList = Array.isArray(igStoriesRes?.data) ? igStoriesRes.data : [];
      for (const st of storiesList) {
        if (!st?.id) continue;
        const item: PlannerPost = {
          id: `meta_story_${st.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: "Story Ativo (Instagram)",
          content: st.caption || "Story publicado nas últimas 24h no Instagram.",
          media_url: st.thumbnail_url || st.media_url || null,
          thumbnail_url: st.thumbnail_url || st.media_url || null,
          permalink: st.permalink || null,
          post_type: "stories",
          status: "published",
          platform: "instagram",
          scheduled_at: null,
          published_at: st.timestamp,
          meta_post_id: st.id,
          likes_count: 0,
          comments_count: 0,
          reach_count: 0,
          impressions_count: 0,
          created_at: st.timestamp,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(st.id, item);
      }
    })
  );

  // Deduplicar posts do Supabase que já existem na Meta API (via meta_post_id)
  const dbLinkedMetaIds = new Set<string>();
  const enrichedDbRows = dbRows.map((row) => {
    if (!row.meta_post_id) return row;
    const parts = row.meta_post_id.split(",").map((s) => s.trim()).filter(Boolean);
    let merged = { ...row };
    for (const pid of parts) {
      dbLinkedMetaIds.add(pid);
      const liveMatch = metaByMetaId.get(pid);
      if (liveMatch) {
        merged = {
          ...merged,
          likes_count: Math.max(merged.likes_count, liveMatch.likes_count),
          comments_count: Math.max(merged.comments_count, liveMatch.comments_count),
          reach_count: Math.max(merged.reach_count, liveMatch.reach_count),
          impressions_count: Math.max(merged.impressions_count, liveMatch.impressions_count),
          shares_count: liveMatch.shares_count ?? merged.shares_count,
          saves_count: liveMatch.saves_count ?? merged.saves_count,
          permalink: liveMatch.permalink || merged.permalink,
          thumbnail_url: liveMatch.thumbnail_url || merged.thumbnail_url,
          account_name: liveMatch.account_name || merged.account_name,
          account_handle: liveMatch.account_handle || merged.account_handle,
          status: liveMatch.status,
        };
      }
    }
    return merged;
  });

  const nonDuplicateMetaPosts = metaPosts.filter((mp) => !mp.meta_post_id || !dbLinkedMetaIds.has(mp.meta_post_id));
  const combinedPosts = [...enrichedDbRows, ...nonDuplicateMetaPosts].sort((a, b) => {
    const da = new Date(a.scheduled_at || a.published_at || a.created_at).getTime();
    const db = new Date(b.scheduled_at || b.published_at || b.created_at).getTime();
    return db - da;
  });

  // Calcular matriz real de heatmap e top 3 horários reais com base nos posts publicados
  const publishedForHeat: RealSocialPost[] = combinedPosts
    .filter((p) => p.status === "published" && p.published_at)
    .map((p) => ({
      id: p.id,
      accountName: p.account_name || "",
      accountHandle: p.account_handle || "",
      title: p.title,
      content: p.content,
      post_type: p.post_type === "feed" ? "image" : p.post_type,
      platform: p.platform === "facebook" ? "facebook" : "instagram",
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      shares_count: p.shares_count || 0,
      saved_count: p.saves_count || 0,
      reach_count: p.reach_count,
      views_count: p.impressions_count,
      total_interactions: p.likes_count + p.comments_count + (p.shares_count || 0) + (p.saves_count || 0),
      engagement_rate: 0,
      media_url: p.media_url || null,
      thumbnail_url: p.thumbnail_url || null,
      permalink: p.permalink || null,
      published_at: p.published_at!,
      ai_sentiment: "",
      ai_recommendation: "",
    }));

  const { matrix: heatmapMatrix, hasData: hasPostsForHeatmap } = buildRealHeatmap(publishedForHeat);

  // Calcular top 3 slots reais (dia/hora) onde houve maior engajamento
  const slotAgg = new Map<string, { dayIdx: number; hour: number; total: number; count: number }>();
  for (const p of publishedForHeat) {
    const dt = new Date(p.published_at);
    if (isNaN(dt.getTime())) continue;
    const dIdx = dt.getDay();
    const hr = dt.getHours();
    const key = `${dIdx}-${hr}`;
    const score = Math.max(1, p.likes_count + p.comments_count * 2 + p.shares_count * 3 + p.saved_count * 2 + Math.round(p.reach_count / 100));
    const prev = slotAgg.get(key) || { dayIdx: dIdx, hour: hr, total: 0, count: 0 };
    prev.total += score;
    prev.count += 1;
    slotAgg.set(key, prev);
  }

  const maxSlotAvg = Math.max(1, ...Array.from(slotAgg.values()).map((s) => s.total / s.count));
  const topTimeSlots: BestSlotItem[] = Array.from(slotAgg.values())
    .map((s) => ({
      dayIdx: s.dayIdx,
      dayName: WEEK_DAY_NAMES_PT[s.dayIdx],
      hour: s.hour,
      score: Math.round(((s.total / s.count) / maxSlotAvg) * 100),
      postsCount: s.count,
    }))
    .sort((a, b) => b.score - a.score || b.postsCount - a.postsCount)
    .slice(0, 3);

  return {
    posts: combinedPosts,
    igProfile,
    heatmapMatrix,
    hasPostsForHeatmap,
    topTimeSlots,
    metaScheduledCount,
    metaPublishedCount,
  };
}

/**
 * Publica agora no Meta (Facebook e/ou Instagram) ou agenda nativamente no Meta Facebook (10 min a 30 dias no futuro).
 */
export async function publishOrScheduleToMeta(params: {
  account: RealSocialAccount;
  masterToken: string;
  platform: "instagram" | "facebook" | "both";
  postType: "feed" | "reels" | "stories" | "carousel";
  content: string;
  mediaUrl?: string | null;
  scheduledAtIso?: string | null;
  publishImmediately: boolean;
}): Promise<{
  metaPostIds: string[];
  facebookScheduledNatively: boolean;
  instagramRequiresLocalQueue: boolean;
  errors: string[];
}> {
  const { account, masterToken, platform, postType, content, mediaUrl, scheduledAtIso, publishImmediately } = params;
  const pageToken = account.access_token || masterToken;
  const metaPostIds: string[] = [];
  const errors: string[] = [];
  let facebookScheduledNatively = false;
  let instagramRequiresLocalQueue = false;

  const isVideo =
    postType === "reels" ||
    Boolean(mediaUrl && /\.(mp4|mov|m4v)(\?|$)/i.test(mediaUrl));

  // Agendamento futuro
  if (!publishImmediately && scheduledAtIso) {
    const schedMs = new Date(scheduledAtIso).getTime();
    const nowMs = Date.now();
    const diffMin = (schedMs - nowMs) / 60000;
    const diffDays = diffMin / (60 * 24);
    const unixSec = Math.floor(schedMs / 1000);

    if (platform === "facebook" || platform === "both") {
      if (diffMin < 10 || diffDays > 30) {
        errors.push(
          "Facebook Meta API exige agendamento entre 10 minutos e 30 dias no futuro para agendamento nativo."
        );
      } else {
        try {
          let fbRes: Response;
          if (mediaUrl && !isVideo) {
            fbRes = await fetch(`${META_API_BASE}/${account.page_id}/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: mediaUrl,
                caption: content,
                published: false,
                scheduled_publish_time: unixSec,
                access_token: pageToken,
              }),
            });
          } else {
            fbRes = await fetch(`${META_API_BASE}/${account.page_id}/feed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: content,
                ...(mediaUrl ? { link: mediaUrl } : {}),
                published: false,
                scheduled_publish_time: unixSec,
                access_token: pageToken,
              }),
            });
          }
          const fbJson = await fbRes.json();
          if (fbJson?.error) {
            errors.push(`Facebook Agendamento: ${fbJson.error.message}`);
          } else if (fbJson?.id || fbJson?.post_id) {
            metaPostIds.push(fbJson.post_id || fbJson.id);
            facebookScheduledNatively = true;
          }
        } catch (err: any) {
          errors.push(`Facebook Agendamento: ${err?.message || "Erro de rede"}`);
        }
      }
    }

    if (platform === "instagram" || platform === "both") {
      instagramRequiresLocalQueue = true;
    }

    return { metaPostIds, facebookScheduledNatively, instagramRequiresLocalQueue, errors };
  }

  // Publicação imediata
  if (platform === "facebook" || platform === "both") {
    try {
      let fbRes: Response;
      if (mediaUrl && isVideo) {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_url: mediaUrl,
            description: content,
            access_token: pageToken,
          }),
        });
      } else if (mediaUrl) {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mediaUrl,
            caption: content,
            access_token: pageToken,
          }),
        });
      } else {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            access_token: pageToken,
          }),
        });
      }
      const fbJson = await fbRes.json();
      if (fbJson?.error) {
        errors.push(`Facebook: ${fbJson.error.message}`);
      } else if (fbJson?.id || fbJson?.post_id) {
        metaPostIds.push(fbJson.post_id || fbJson.id);
      }
    } catch (err: any) {
      errors.push(`Facebook: ${err?.message || "Erro ao publicar"}`);
    }
  }

  if (platform === "instagram" || platform === "both") {
    if (!account.instagram_account_id) {
      errors.push("Esta página do Facebook não possui um Instagram Business vinculado.");
    } else if (!mediaUrl) {
      errors.push("Instagram exige URL ou upload de imagem/vídeo para publicar.");
    } else {
      try {
        const containerBody: Record<string, string> = {
          caption: content || "",
          access_token: masterToken,
        };
        if (isVideo) {
          containerBody.media_type = "REELS";
          containerBody.video_url = mediaUrl;
        } else if (postType === "stories") {
          containerBody.media_type = "STORIES";
          containerBody.image_url = mediaUrl;
        } else {
          containerBody.image_url = mediaUrl;
        }

        const cRes = await fetch(`${META_API_BASE}/${account.instagram_account_id}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        });
        const cJson = await cRes.json();
        if (cJson?.error) throw new Error(cJson.error.message);
        const creationId = cJson.id;

        if (isVideo && creationId) {
          let statusCode = "IN_PROGRESS";
          let attempts = 0;
          while (statusCode === "IN_PROGRESS" && attempts < 12) {
            await new Promise((r) => setTimeout(r, 2500));
            const chk = await fetchMetaJson(
              `${META_API_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(masterToken)}`
            );
            if (chk?.status_code) statusCode = chk.status_code;
            if (statusCode === "ERROR") throw new Error("Processamento do vídeo falhou no Instagram.");
            attempts++;
          }
        }

        const pubRes = await fetch(`${META_API_BASE}/${account.instagram_account_id}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: masterToken,
          }),
        });
        const pubJson = await pubRes.json();
        if (pubJson?.error) throw new Error(pubJson.error.message);
        if (pubJson?.id) metaPostIds.push(pubJson.id);
      } catch (err: any) {
        errors.push(`Instagram: ${err?.message || "Erro ao publicar"}`);
      }
    }
  }

  return { metaPostIds, facebookScheduledNatively, instagramRequiresLocalQueue, errors };
}

export async function deleteMetaScheduledPost(metaPostId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${META_API_BASE}/${metaPostId}?access_token=${encodeURIComponent(pageToken)}`,
      { method: "DELETE" }
    );
    const json = await res.json();
    if (json?.error) return { ok: false, error: json.error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Erro ao cancelar na Meta" };
  }
}


