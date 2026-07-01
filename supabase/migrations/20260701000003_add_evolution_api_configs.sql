-- Migration: Adicionar suporte à Evolution API na tabela meta_ads_configs
-- Date: 2026-07-01

ALTER TABLE public.meta_ads_configs
  ADD COLUMN IF NOT EXISTS whatsapp_provider text DEFAULT 'baileys_custom',
  ADD COLUMN IF NOT EXISTS whatsapp_api_key text,
  ADD COLUMN IF NOT EXISTS whatsapp_instance_name text;

-- Recarregar schema
NOTIFY pgrst, 'reload schema';
