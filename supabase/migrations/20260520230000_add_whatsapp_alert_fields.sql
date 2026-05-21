-- Adicionar campos de WhatsApp para alertas na tabela de configuracao
ALTER TABLE public.meta_ads_configs ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE public.meta_ads_configs ADD COLUMN IF NOT EXISTS whatsapp_gateway_url text DEFAULT 'http://localhost:3001';
