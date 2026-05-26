-- Adiciona coluna frequency em asset_metrics (adsets e ads)
-- O sync já busca frequency do Meta API mas não salvava o campo
ALTER TABLE public.asset_metrics ADD COLUMN IF NOT EXISTS frequency NUMERIC(6,2) DEFAULT 0;
