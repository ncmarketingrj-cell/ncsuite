-- Cria a view daily_metrics que agrega métricas por conta de anúncio + dia
-- Usado pelos cards de cliente e pela tela de detalhe de cliente

CREATE OR REPLACE VIEW public.daily_metrics AS
SELECT
  c.ad_account_id,
  m.date,

  -- Gasto total da conta no dia
  SUM(m.cost)                                                     AS spend,

  -- Impressões e alcance
  SUM(m.impressions)                                              AS impressions,
  SUM(m.reach)                                                    AS reach,

  -- Cliques
  SUM(m.clicks)                                                   AS clicks,

  -- Leads: campanhas de geração de leads, mensagens, engajamento, tráfego
  SUM(
    CASE WHEN m.result_type IN (
      'OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES',
      'OUTCOME_ENGAGEMENT', 'LINK_CLICKS', 'OUTCOME_TRAFFIC',
      'POST_ENGAGEMENT', 'VIDEO_VIEWS', 'OUTCOME_AWARENESS',
      'APP_INSTALLS', 'OUTCOME_APP_PROMOTION'
    ) THEN m.conversions ELSE 0 END
  )                                                               AS leads,

  -- Purchases: campanhas de vendas / conversões
  SUM(
    CASE WHEN m.result_type IN ('CONVERSIONS', 'OUTCOME_SALES')
    THEN m.conversions ELSE 0 END
  )                                                               AS purchases,

  -- ROAS: não temos purchase_value no schema, mantemos 0
  0::numeric                                                      AS roas,

  -- CTR (%): cliques / impressões × 100
  CASE WHEN SUM(m.impressions) > 0
    THEN ROUND((SUM(m.clicks)::numeric / SUM(m.impressions)) * 100, 2)
    ELSE 0
  END                                                             AS ctr,

  -- CPM (R$): custo por mil impressões
  CASE WHEN SUM(m.impressions) > 0
    THEN ROUND((SUM(m.cost) / SUM(m.impressions)) * 1000, 2)
    ELSE 0
  END                                                             AS cpm,

  -- CPA (R$): custo por conversão total
  CASE WHEN SUM(m.conversions) > 0
    THEN ROUND(SUM(m.cost) / SUM(m.conversions), 2)
    ELSE 0
  END                                                             AS cpa

FROM public.metrics m
JOIN public.campaigns c ON c.id = m.campaign_id
WHERE c.ad_account_id IS NOT NULL
GROUP BY c.ad_account_id, m.date;

-- Permissões de acesso
GRANT SELECT ON public.daily_metrics TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
