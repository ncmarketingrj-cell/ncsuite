-- Adicionar chaves únicas para evitar duplicatas nas inserções
ALTER TABLE public.asset_metrics ADD CONSTRAINT asset_metrics_adset_date_key UNIQUE (ad_set_id, date);
ALTER TABLE public.asset_metrics ADD CONSTRAINT asset_metrics_ad_date_key UNIQUE (ad_id, date);
