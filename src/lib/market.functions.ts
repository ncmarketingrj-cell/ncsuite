import { createServerFn } from "@tanstack/react-start";
import {
  buildRadarFeeds,
  MARKET_PORTALS,
  type RadarRegionFilter,
  type RadarTimeFilter,
} from "./marketPortals";

export interface ServerMarketArticle {
  id: string;
  title: string;
  source: string;
  link: string;
  pubDate: string;
  snippet: string;
  category: "mercado" | "lancamentos" | "trafego" | "leis";
}

/**
 * Sanitiza e valida datas de feeds RSS ou fallbacks para evitar datas inválidas (ex: 31/12/1969).
 */
export function parseSafeIsoDate(rawDate?: string | null): string {
  if (!rawDate) return new Date().toISOString();
  try {
    const d = new Date(rawDate);
    const time = d.getTime();
    if (isNaN(time) || d.getFullYear() < 2000) {
      return new Date().toISOString();
    }
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Formata com segurança a data de publicação de um artigo para exibição em pt-BR.
 * NUNCA retorna 31/12/1969.
 */
export function formatArticleDate(rawDate?: string | null): string {
  if (!rawDate) return new Date().toLocaleDateString("pt-BR");
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) {
      return new Date().toLocaleDateString("pt-BR");
    }
    return d.toLocaleDateString("pt-BR");
  } catch {
    return new Date().toLocaleDateString("pt-BR");
  }
}

/**
 * Extrai artigos de uma string XML RSS do Google News.
 */
export function parseRssXmlToArticles(
  xml: string,
  category: ServerMarketArticle["category"],
  limit = 12
): ServerMarketArticle[] {
  const articles: ServerMarketArticle[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  let count = 0;

  for (const match of itemMatches) {
    if (count >= limit) break;
    const item = match[1];

    const titleMatch =
      item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      item.match(/<title>(.*?)<\/title>/);
    const linkMatch =
      item.match(/<link>(.*?)<\/link>/) ||
      item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
    const descMatch =
      item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
      item.match(/<description>(.*?)<\/description>/);

    const rawTitle = titleMatch ? titleMatch[1] : "";
    const cleanTitle = rawTitle
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

    const source = sourceMatch
      ? sourceMatch[1].trim()
      : cleanTitle.split(" - ").pop() || "Setor Automotivo";
    const pureTitle = cleanTitle.includes(" - ")
      ? cleanTitle.substring(0, cleanTitle.lastIndexOf(" - "))
      : cleanTitle;
    const snippet = descMatch
      ? descMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 260)
      : "";
    const link = linkMatch ? linkMatch[1].trim() : "";

    if (pureTitle && pureTitle.length > 5) {
      articles.push({
        id: `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: pureTitle,
        source,
        link,
        pubDate: parseSafeIsoDate(pubDateMatch ? pubDateMatch[1].trim() : null),
        snippet,
        category,
      });
      count++;
    }
  }

  return articles;
}

export const FALLBACK_ARTICLES: ServerMarketArticle[] = [];

export interface FetchRadarInput {
  timeFilter?: RadarTimeFilter;
  regionFilter?: RadarRegionFilter;
  selectedPortalIds?: string[];
}

export const fetchMarketIntelFn = createServerFn({ method: "POST" })
  .inputValidator((d?: FetchRadarInput) => d || {})
  .handler(async ({ data }): Promise<{
    success: boolean;
    articles: ServerMarketArticle[];
    scanned_at: string;
    provider: string;
  }> => {
    try {
      const timeFilter: RadarTimeFilter = data?.timeFilter || "7d";
      const regionFilter: RadarRegionFilter = data?.regionFilter || "BR";
      const selectedPortalIds: string[] =
        data?.selectedPortalIds && data.selectedPortalIds.length > 0
          ? data.selectedPortalIds
          : MARKET_PORTALS.map((p) => p.id);

      const feeds = buildRadarFeeds({ timeFilter, regionFilter, selectedPortalIds });

      const allArticles: ServerMarketArticle[] = [];
      const seenTitles = new Set<string>();

      await Promise.all(
        feeds.map(async (feed) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(feed.url, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VictoriaAI/2.0",
              },
            });
            clearTimeout(timeoutId);

            if (!res.ok) return;
            const xml = await res.text();
            const parsed = parseRssXmlToArticles(xml, feed.cat, 12);

            for (const art of parsed) {
              const normalizedTitle = art.title.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (normalizedTitle.length > 5 && !seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                allArticles.push(art);
              }
            }
          } catch (e) {
            console.warn(`[MARKET_INTEL] Feed ${feed.label} indisponível, continuando...`, e);
          }
        })
      );

      allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      return {
        success: allArticles.length > 0,
        articles: allArticles,
        scanned_at: new Date().toISOString(),
        provider: "Google News Public RSS Multi-Portais (Custo R$ 0,00)",
      };
    } catch (err: any) {
      console.warn("[MARKET_INTEL] Erro na varredura server-side:", err);
      return {
        success: false,
        articles: [],
        scanned_at: new Date().toISOString(),
        provider: "Erro na varredura",
      };
    }
  });
