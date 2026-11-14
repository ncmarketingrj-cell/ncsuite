-- Reconciliacao segura de contas x clientes e restauracao de cliques legados (pre sync_version)
UPDATE public.metrics
SET inline_link_clicks = NULL
WHERE sync_version IS NULL
  AND inline_link_clicks = 0
  AND COALESCE(clicks, 0) > 0;

UPDATE public.metrics
SET all_clicks = NULL
WHERE sync_version IS NULL
  AND all_clicks = 0
  AND COALESCE(clicks, 0) > 0;

UPDATE public.asset_metrics
SET inline_link_clicks = NULL
WHERE sync_version IS NULL
  AND inline_link_clicks = 0
  AND COALESCE(clicks, 0) > 0;

UPDATE public.asset_metrics
SET all_clicks = NULL
WHERE sync_version IS NULL
  AND all_clicks = 0
  AND COALESCE(clicks, 0) > 0;

INSERT INTO public.clients (name, meta_ad_account_id, user_id, platform, status)
SELECT a.name, a.id, a.user_id, COALESCE(a.platform, 'Meta Ads'), 'ativo'
FROM public.ad_accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients c WHERE c.meta_ad_account_id = a.id
);

INSERT INTO public.ad_accounts (id, name, currency, status, user_id, platform, last_sync)
SELECT c.meta_ad_account_id, c.name, 'BRL', 0, c.user_id, COALESCE(c.platform, 'Meta Ads'), NULL
FROM public.clients c
WHERE c.meta_ad_account_id IS NOT NULL
  AND c.meta_ad_account_id LIKE 'act_%'
  AND LOWER(COALESCE(c.status, 'ativo')) = 'ativo'
  AND NOT EXISTS (
    SELECT 1 FROM public.ad_accounts a WHERE a.id = c.meta_ad_account_id
  );

UPDATE public.campaigns camp
SET client_id = cl.id
FROM public.clients cl
WHERE camp.client_id IS NULL
  AND camp.ad_account_id = cl.meta_ad_account_id;
