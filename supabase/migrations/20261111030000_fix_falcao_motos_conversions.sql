-- ==============================================================================
-- MIGRATION: 20261111030000_fix_falcao_motos_conversions.sql
-- Correção definitiva dos resultados das campanhas e anúncios da conta
-- 'Falcão Motos - Anúncios' para o dia 11/11/2026, espelhando fielmente
-- o Gerenciador de Anúncios do Meta (Conversas por mensagem iniciadas no WhatsApp).
-- ==============================================================================

-- 1. Atualizar métricas de campanhas em public.metrics para 11/11/2026
-- RUTHH - MSG: 30 conversas de mensagem iniciadas, Gasto R$ 168,93
UPDATE public.metrics m
SET 
  conversions = 30,
  cost = 168.93,
  impressions = 9357,
  reach = 8082,
  result_type = 'MESSAGES'
FROM public.campaigns c
WHERE m.campaign_id = c.id
  AND m.date = '2026-11-11'
  AND UPPER(c.name) LIKE '%RUTHH%MSG%';

-- TAYNA - MSG: 22 conversas de mensagem iniciadas, Gasto R$ 162,90
UPDATE public.metrics m
SET 
  conversions = 22,
  cost = 162.90,
  impressions = 5750,
  reach = 4905,
  result_type = 'MESSAGES'
FROM public.campaigns c
WHERE m.campaign_id = c.id
  AND m.date = '2026-11-11'
  AND UPPER(c.name) LIKE '%TAYNA%MSG%';

-- 2. Atualizar public.meta_period_stats para as campanhas em 11/11/2026
UPDATE public.meta_period_stats ps
SET 
  conversions = 30,
  spend = 168.93,
  impressions = 9357,
  reach = 8082,
  frequency = CASE WHEN 8082 > 0 THEN 9357::numeric / 8082 ELSE 1.16 END
FROM public.campaigns c
WHERE ps.entity_type = 'campaign'
  AND ps.entity_id = c.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(c.name) LIKE '%RUTHH%MSG%';

UPDATE public.meta_period_stats ps
SET 
  conversions = 22,
  spend = 162.90,
  impressions = 5750,
  reach = 4905,
  frequency = CASE WHEN 4905 > 0 THEN 5750::numeric / 4905 ELSE 1.17 END
FROM public.campaigns c
WHERE ps.entity_type = 'campaign'
  AND ps.entity_id = c.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(c.name) LIKE '%TAYNA%MSG%';

-- 3. Atualizar anúncios da campanha RUTHH - MSG em public.asset_metrics para 11/11/2026
-- ONIBUS: 20 conversas (R$ 120,09)
UPDATE public.asset_metrics am
SET conversions = 20
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%ONIBUS%';

-- 3 Tias: 4 conversas (R$ 9,80)
UPDATE public.asset_metrics am
SET conversions = 4
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%3 TIAS%';

-- INSTITUCIONAL (LOJA): 1 conversa (R$ 11,02)
UPDATE public.asset_metrics am
SET conversions = 1
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%INSTITUCIONAL%';

-- Titan: 1 conversa (R$ 3,22)
UPDATE public.asset_metrics am
SET conversions = 1
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%TITAN%';

-- Fan 2026 (anúncio ativo que teve gasto de ~R$ 8,30): 4 conversas
UPDATE public.asset_metrics am
SET conversions = 4
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%FAN%'
  AND (am.cost > 5 OR am.clicks >= 2);

-- Fan 2026 com gasto residual (~R$ 1,12): 0 conversas
UPDATE public.asset_metrics am
SET conversions = 0
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%FAN%'
  AND am.cost <= 3;

-- PCX 160: 0 conversas (teve 7 cliques mas zero conversas de mensagem)
UPDATE public.asset_metrics am
SET conversions = 0
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%PCX%';

-- LIMPA ESTOQUE: 0 conversas
UPDATE public.asset_metrics am
SET conversions = 0
FROM public.ads a
WHERE am.ad_id = a.id
  AND am.date = '2026-11-11'
  AND UPPER(a.name) LIKE '%LIMPA ESTOQUE%';

-- 4. Atualizar anúncios em public.meta_period_stats para 11/11/2026
UPDATE public.meta_period_stats ps
SET conversions = 20
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%ONIBUS%';

UPDATE public.meta_period_stats ps
SET conversions = 4
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%3 TIAS%';

UPDATE public.meta_period_stats ps
SET conversions = 1
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%INSTITUCIONAL%';

UPDATE public.meta_period_stats ps
SET conversions = 1
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%TITAN%';

UPDATE public.meta_period_stats ps
SET conversions = 4
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%FAN%'
  AND (ps.spend > 5 OR ps.clicks >= 2);

UPDATE public.meta_period_stats ps
SET conversions = 0
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%FAN%'
  AND ps.spend <= 3;

UPDATE public.meta_period_stats ps
SET conversions = 0
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%PCX%';

UPDATE public.meta_period_stats ps
SET conversions = 0
FROM public.ads a
WHERE ps.entity_type = 'ad'
  AND ps.entity_id = a.id
  AND ps.start_date = '2026-11-11'
  AND ps.end_date = '2026-11-11'
  AND UPPER(a.name) LIKE '%LIMPA ESTOQUE%';

-- 5. Atualizar o objetivo explícito das campanhas de WhatsApp para MESSAGES
UPDATE public.campaigns
SET objective = 'MESSAGES'
WHERE UPPER(name) ~ '(MSG|MENSAGEM|WPP|WHATSAPP|DIRECT|CONVERSA)'
  AND COALESCE(objective, '') != 'MESSAGES';

-- Notificar recarga de schema para postgREST
NOTIFY pgrst, 'reload schema';
