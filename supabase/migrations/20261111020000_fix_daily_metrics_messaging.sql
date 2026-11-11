-- ==============================================================================
-- MIGRATION: 20261111020000_fix_daily_metrics_messaging.sql
-- Garante que campanhas de mensagens/WhatsApp (ex: RUTHH - MSG, TAYNA - MSG)
-- sejam sempre computadas como LEADS na view daily_metrics, mesmo quando criadas
-- sob objetivo OUTCOME_TRAFFIC ou LINK_CLICKS no Gerenciador Meta.
-- ==============================================================================

DROP VIEW IF EXISTS public.daily_metrics;

CREATE VIEW public.daily_metrics AS
SELECT
  c.ad_account_id,
  m.date,

  SUM(m.cost)         AS spend,
  SUM(m.impressions)  AS impressions,
  SUM(m.reach)        AS reach,
  SUM(m.clicks)       AS clicks,

  -- Leads / Mensagens:
  -- Conta qualquer campanha cujo objetivo ou result_type seja LEAD/MESSAGES/ENGAGEMENT
  -- OU cujo nome contenha MSG, MENSAGEM, WPP, WHATSAPP, DIRECT, CONVERSA
  -- OU quando houver conversões registradas que não sejam puramente awareness/vídeo
  SUM(CASE WHEN (
    m.result_type IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT')
    OR c.objective IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT')
    OR UPPER(c.name) ~ '(MSG|MENSAGEM|WPP|WHATSAPP|DIRECT|CONVERSA)'
    OR (
      m.conversions > 0 
      AND COALESCE(c.objective, '') NOT IN ('OUTCOME_AWARENESS', 'VIDEO_VIEWS', 'CONVERSIONS', 'OUTCOME_SALES')
      AND COALESCE(m.result_type, '') NOT IN ('OUTCOME_AWARENESS', 'VIDEO_VIEWS', 'CONVERSIONS', 'OUTCOME_SALES')
    )
  ) THEN m.conversions ELSE 0 END)  AS leads,

  -- Purchases: campanhas de vendas / conversões
  SUM(CASE WHEN (
    m.result_type IN ('CONVERSIONS', 'OUTCOME_SALES')
    OR c.objective IN ('CONVERSIONS', 'OUTCOME_SALES')
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

  -- CPA / CPL (R$)
  CASE WHEN SUM(CASE WHEN (
    m.result_type IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT', 'CONVERSIONS', 'OUTCOME_SALES')
    OR c.objective IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT', 'CONVERSIONS', 'OUTCOME_SALES')
    OR UPPER(c.name) ~ '(MSG|MENSAGEM|WPP|WHATSAPP|DIRECT|CONVERSA)'
    OR (
      m.conversions > 0 
      AND COALESCE(c.objective, '') NOT IN ('OUTCOME_AWARENESS', 'VIDEO_VIEWS')
    )
  ) THEN m.conversions ELSE 0 END) > 0
    THEN ROUND(SUM(m.cost) / SUM(CASE WHEN (
      m.result_type IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT', 'CONVERSIONS', 'OUTCOME_SALES')
      OR c.objective IN ('OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES', 'OUTCOME_ENGAGEMENT', 'CONVERSIONS', 'OUTCOME_SALES')
      OR UPPER(c.name) ~ '(MSG|MENSAGEM|WPP|WHATSAPP|DIRECT|CONVERSA)'
      OR (
        m.conversions > 0 
        AND COALESCE(c.objective, '') NOT IN ('OUTCOME_AWARENESS', 'VIDEO_VIEWS')
      )
    ) THEN m.conversions ELSE 0 END), 2)
    ELSE 0
  END                               AS cpa

FROM public.metrics m
JOIN public.campaigns c ON c.id = m.campaign_id
WHERE c.ad_account_id IS NOT NULL
GROUP BY c.ad_account_id, m.date;

GRANT SELECT ON public.daily_metrics TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';

