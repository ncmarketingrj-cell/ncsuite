-- Corrige classificação de leads/purchases na view daily_metrics
-- Problema: campanhas de tráfego (OUTCOME_TRAFFIC/LINK_CLICKS) e vídeo (VIDEO_VIEWS)
-- tinham seus resultados (link_clicks, thruplay) contados como leads — incorreto.
-- Cada campanha tem seu objetivo próprio e deve ser classificada adequadamente.
-- Nota: DROP + CREATE necessário pois CREATE OR REPLACE não permite reordenar colunas.

DROP VIEW IF EXISTS public.daily_metrics;

CREATE VIEW public.daily_metrics AS
SELECT
  c.ad_account_id,
  m.date,

  SUM(m.cost)         AS spend,
  SUM(m.impressions)  AS impressions,
  SUM(m.reach)        AS reach,
  SUM(m.clicks)       AS clicks,

  -- Leads: apenas objetivos genuínos de geração de leads / mensagens
  SUM(CASE WHEN m.result_type IN (
    'OUTCOME_LEADS',
    'LEAD_GENERATION',
    'MESSAGES',
    'OUTCOME_ENGAGEMENT'
  ) THEN m.conversions ELSE 0 END)  AS leads,

  -- Purchases: campanhas de vendas / conversões
  SUM(CASE WHEN m.result_type IN (
    'CONVERSIONS',
    'OUTCOME_SALES'
  ) THEN m.conversions ELSE 0 END)  AS purchases,

  -- Resultados totais — inclui tráfego, vídeo, awareness, etc.
  SUM(m.conversions)                AS results,

  -- ROAS: 0 (purchase_value não está no schema atual)
  0::numeric                        AS roas,

  -- CTR (%)
  CASE WHEN SUM(m.impressions) > 0
    THEN ROUND((SUM(m.clicks)::numeric / SUM(m.impressions)) * 100, 2)
    ELSE 0
  END                               AS ctr,

  -- CPM (R$)
  CASE WHEN SUM(m.impressions) > 0
    THEN ROUND((SUM(m.cost) / SUM(m.impressions)) * 1000, 2)
    ELSE 0
  END                               AS cpm,

  -- CPA (R$) — usa total de conversões para não inflar com tráfego
  CASE WHEN SUM(CASE WHEN m.result_type IN (
    'OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT',
    'CONVERSIONS', 'OUTCOME_SALES'
  ) THEN m.conversions ELSE 0 END) > 0
    THEN ROUND(SUM(m.cost) / SUM(CASE WHEN m.result_type IN (
      'OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT',
      'CONVERSIONS', 'OUTCOME_SALES'
    ) THEN m.conversions ELSE 0 END), 2)
    ELSE 0
  END                               AS cpa

FROM public.metrics m
JOIN public.campaigns c ON c.id = m.campaign_id
WHERE c.ad_account_id IS NOT NULL
GROUP BY c.ad_account_id, m.date;

GRANT SELECT ON public.daily_metrics TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';
