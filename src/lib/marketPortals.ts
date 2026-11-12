export type PortalCategory = "automotivo" | "marketing" | "leis";
export type RadarTimeFilter = "1d" | "7d" | "30d";
export type RadarRegionFilter = "BR" | "RJ" | "SP" | "MG" | "SUL" | "NE";

export interface MarketPortal {
  id: string;
  name: string;
  domain: string;
  category: PortalCategory;
  scope: string;
  queryHint: string;
}

export const RADAR_TIME_OPTIONS: Array<{ id: RadarTimeFilter; label: string; desc: string }> = [
  { id: "1d", label: "Hoje (24h)", desc: "Notícias diárias das últimas 24 horas" },
  { id: "7d", label: "Última Semana (7d)", desc: "Principais notícias dos últimos 7 dias" },
  { id: "30d", label: "Último Mês (30d)", desc: "Radar mensal consolidado" },
];

export const RADAR_REGION_OPTIONS: Array<{ id: RadarRegionFilter; label: string; queryTerms: string }> = [
  { id: "BR", label: "Todo o Brasil", queryTerms: "Brasil" },
  { id: "RJ", label: "Rio de Janeiro (RJ)", queryTerms: '("Rio de Janeiro" OR RJ)' },
  { id: "SP", label: "São Paulo (SP)", queryTerms: '("São Paulo" OR SP)' },
  { id: "MG", label: "Minas Gerais (MG)", queryTerms: '("Minas Gerais" OR MG)' },
  { id: "SUL", label: "Região Sul (PR/SC/RS)", queryTerms: "(Paraná OR Santa Catarina OR Rio Grande do Sul)" },
  { id: "NE", label: "Nordeste", queryTerms: "(Bahia OR Pernambuco OR Ceará OR Nordeste)" },
];

export const MARKET_PORTALS: MarketPortal[] = [
  // ── 1. AUTOMOTIVO & MERCADO (10 PORTAIS) ──
  { id: "autoesporte", name: "AutoEsporte", domain: "autoesporte.globo.com", category: "automotivo", scope: "Nacional", queryHint: "carros seminovos mercado" },
  { id: "quatrorodas", name: "Quatro Rodas", domain: "quatrorodas.abril.com.br", category: "automotivo", scope: "Nacional", queryHint: "carros lançamentos mercado" },
  { id: "motor1", name: "Motor1 Brasil", domain: "motor1.uol.com.br", category: "automotivo", scope: "Nacional", queryHint: "vendas veículos mercado" },
  { id: "webmotors", name: "Webmotors WM1", domain: "webmotors.com.br", category: "automotivo", scope: "Nacional", queryHint: "seminovos usados financiamento" },
  { id: "automotivebusiness", name: "Automotive Business", domain: "automotivebusiness.com.br", category: "automotivo", scope: "Nacional", queryHint: "concessionárias indústria automotiva" },
  { id: "fenabrave", name: "Fenabrave", domain: "fenabrave.org.br", category: "automotivo", scope: "Nacional", queryHint: "emplacamentos concessionárias vendas" },
  { id: "autopapo", name: "AutoPapo UOL", domain: "autopapo.uol.com.br", category: "automotivo", scope: "Nacional", queryHint: "carros mercado consumidor" },
  { id: "jornaldocarro", name: "Jornal do Carro", domain: "jornaldocarro.estadao.com.br", category: "automotivo", scope: "Nacional / SP", queryHint: "veículos vendas mercado" },
  { id: "carrosig", name: "Carros iG", domain: "carros.ig.com.br", category: "automotivo", scope: "Nacional", queryHint: "carros seminovos mercado" },
  { id: "insideevs", name: "InsideEVs Brasil", domain: "insideevs.uol.com.br", category: "automotivo", scope: "Nacional", queryHint: "elétricos híbridos vendas" },

  // ── 2. MARKETING, TRÁFEGO PAGO & VENDAS AUTOMOTIVAS (10 PORTAIS) ──
  { id: "meioemensagem", name: "Meio & Mensagem", domain: "meioemensagem.com.br", category: "marketing", scope: "Nacional", queryHint: "marketing meta google automotivo" },
  { id: "rdstation", name: "RD Station / Resultados Digitais", domain: "resultadosdigitais.com.br", category: "marketing", scope: "Nacional", queryHint: "leads vendas tráfego whatsapp" },
  { id: "thinkwithgoogle", name: "Think with Google", domain: "thinkwithgoogle.com", category: "marketing", scope: "Nacional", queryHint: "automotivo consumidor ads" },
  { id: "metanews", name: "Meta Business / Newsroom", domain: "about.fb.com", category: "marketing", scope: "Global / BR", queryHint: "ads whatsapp instagram" },
  { id: "sebrae", name: "Sebrae Negócios", domain: "sebrae.com.br", category: "marketing", scope: "Nacional", queryHint: "vendas marketing veículos" },
  { id: "exame", name: "Exame Negócios", domain: "exame.com", category: "marketing", scope: "Nacional", queryHint: "carros concessionárias marketing" },
  { id: "infomoney", name: "InfoMoney Consumo & Autos", domain: "infomoney.com.br", category: "marketing", scope: "Nacional", queryHint: "carros financiamento ipva vendas" },
  { id: "valoreconomico", name: "Valor Econômico", domain: "valor.globo.com", category: "marketing", scope: "Nacional", queryHint: "automotivo montadoras concessionárias" },
  { id: "ecommercebrasil", name: "E-Commerce Brasil", domain: "ecommercebrasil.com.br", category: "marketing", scope: "Nacional", queryHint: "tráfego pago whatsapp conversão" },
  { id: "mundodomarketing", name: "Mundo do Marketing", domain: "mundodomarketing.com.br", category: "marketing", scope: "Nacional", queryHint: "consumidor campanhas automotivo" },

  // ── 3. LEIS, GOVERNO, DETRAN & REGULAÇÃO AUTOMOTIVA (10 PORTAIS) ──
  { id: "senatran", name: "Gov.br / SENATRAN & CONTRAN", domain: "gov.br", category: "leis", scope: "Nacional", queryHint: "CONTRAN SENATRAN trânsito veículos" },
  { id: "planalto_dou", name: "Diário Oficial / Planalto", domain: "in.gov.br", category: "leis", scope: "Nacional", queryHint: "veículos automotivo CONTRAN IPVA" },
  { id: "camara", name: "Agência Câmara", domain: "camara.leg.br", category: "leis", scope: "Nacional", queryHint: "lei projeto veículos carros trânsito" },
  { id: "senado", name: "Agência Senado", domain: "senado.leg.br", category: "leis", scope: "Nacional", queryHint: "lei trânsito veículos carros IPVA" },
  { id: "detran_rj", name: "DETRAN-RJ", domain: "detran.rj.gov.br", category: "leis", scope: "Rio de Janeiro", queryHint: "vistoria licenciamento veículos" },
  { id: "detran_sp", name: "DETRAN-SP", domain: "detran.sp.gov.br", category: "leis", scope: "São Paulo", queryHint: "licenciamento transferência veículos" },
  { id: "detran_mg", name: "Trânsito MG / DETRAN-MG", domain: "transito.mg.gov.br", category: "leis", scope: "Minas Gerais", queryHint: "veículos licenciamento IPVA" },
  { id: "sefaz_ipva", name: "SEFAZ / IPVA & Tributos", domain: "fazenda.rj.gov.br", category: "leis", scope: "Estados / IPVA", queryHint: "IPVA ICMS isenção veículos" },
  { id: "procon", name: "Procon / Direito Automotivo", domain: "procon.sp.gov.br", category: "leis", scope: "Consumidor", queryHint: "veículos concessionária garantia" },
  { id: "conjur", name: "ConJur — Consultor Jurídico", domain: "conjur.com.br", category: "leis", scope: "Nacional", queryHint: "veículos trânsito concessionária IPVA" },
];

export const PORTAL_CATEGORY_LABELS: Record<PortalCategory, { label: string; badge: string; color: string }> = {
  automotivo: {
    label: "Automotivo & Mercado",
    badge: "10 Portais",
    color: "text-red-400 border-red-500/30 bg-red-500/10",
  },
  marketing: {
    label: "Marketing, Tráfego & Vendas",
    badge: "10 Portais",
    color: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
  leis: {
    label: "Leis, Governo & DETRAN",
    badge: "10 Portais",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
};

export interface GeneratedRssFeed {
  cat: "mercado" | "lancamentos" | "trafego" | "leis";
  url: string;
  label: string;
}

/**
 * Constrói URLs reais do Google News RSS com filtro temporal (when:1d / 7d / 30d),
 * filtro de estado/região e filtro exato dos portais selecionados no checklist.
 */
export function buildRadarFeeds(options: {
  timeFilter: RadarTimeFilter;
  regionFilter: RadarRegionFilter;
  selectedPortalIds: string[];
}): GeneratedRssFeed[] {
  const { timeFilter, regionFilter, selectedPortalIds } = options;
  const selectedPortals = MARKET_PORTALS.filter((p) => selectedPortalIds.includes(p.id));
  const regionObj = RADAR_REGION_OPTIONS.find((r) => r.id === regionFilter) || RADAR_REGION_OPTIONS[0];
  const regionTerm = regionFilter === "BR" ? "Brasil" : regionObj.queryTerms;

  const feeds: GeneratedRssFeed[] = [];

  const autoPortals = selectedPortals.filter((p) => p.category === "automotivo");
  const mktPortals = selectedPortals.filter((p) => p.category === "marketing");
  const lawPortals = selectedPortals.filter((p) => p.category === "leis");

  // 1. Automotivo & Mercado
  if (autoPortals.length > 0) {
    const sites1 = autoPortals.slice(0, 5).map((p) => `site:${p.domain}`).join(" OR ");
    const q1 = `(${sites1}) (carros OR seminovos OR concessionárias OR veículos OR vendas) when:${timeFilter}`;
    feeds.push({
      cat: "mercado",
      label: "Automotivo (Portais Principais)",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(q1)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });

    if (autoPortals.length > 5) {
      const sites2 = autoPortals.slice(5).map((p) => `site:${p.domain}`).join(" OR ");
      const q2 = `(${sites2}) (carros OR seminovos OR veículos OR lançamentos) when:${timeFilter}`;
      feeds.push({
        cat: "lancamentos",
        label: "Automotivo (Portais Complementares)",
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(q2)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
      });
    }

    // Busca regional automotiva para garantir volume fresco mesmo no filtro de 24h
    const qAutoRegion = `(mercado automotivo OR venda de carros OR seminovos OR financiamento veículos) ${regionTerm} when:${timeFilter}`;
    feeds.push({
      cat: "mercado",
      label: `Mercado Automotivo (${regionFilter})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qAutoRegion)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });
  }

  // 2. Marketing & Tráfego Pago Automotivo
  if (mktPortals.length > 0) {
    const sitesMkt = mktPortals.slice(0, 5).map((p) => `site:${p.domain}`).join(" OR ");
    const qMkt = `(${sitesMkt}) ("meta ads" OR "google ads" OR marketing OR vendas OR leads OR automotivo OR carros) when:${timeFilter}`;
    feeds.push({
      cat: "trafego",
      label: "Marketing & Negócios (Portais)",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qMkt)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });

    const qTrafego = `("meta ads" OR "tráfego pago" OR "google ads" OR "marketing digital" OR "vendas whatsapp") (carros OR concessionária OR veículos OR varejo) when:${timeFilter}`;
    feeds.push({
      cat: "trafego",
      label: "Tráfego Pago & Marketing Automotivo",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qTrafego)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });
  }

  // 3. Leis, Governo, DETRAN & Regulação Automotiva
  if (lawPortals.length > 0) {
    const sitesLaw = lawPortals.slice(0, 5).map((p) => `site:${p.domain}`).join(" OR ");
    const qLawSites = `(${sitesLaw}) (lei OR resolução OR CONTRAN OR SENATRAN OR DETRAN OR IPVA OR veículos OR carros OR trânsito) when:${timeFilter}`;
    feeds.push({
      cat: "leis",
      label: "Leis & Governo (Portais Oficiais)",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qLawSites)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });

    const qLawGeneral = `(lei OR decreto OR resolução OR CONTRAN OR SENATRAN OR DETRAN OR IPVA OR "código de trânsito" OR isenção OR vistoria OR concessionária) (veículos OR carros OR automotivo) ${regionTerm} when:${timeFilter}`;
    feeds.push({
      cat: "leis",
      label: `Leis Automotivas (${regionFilter})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qLawGeneral)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });
  }

  // Fallback se nada estiver marcado
  if (feeds.length === 0) {
    const qFallback = `(mercado automotivo OR carros seminovos OR lei veículos) ${regionTerm} when:${timeFilter}`;
    feeds.push({
      cat: "mercado",
      label: "Mercado Geral",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(qFallback)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    });
  }

  return feeds;
}

