-- 20260518060000_add_notification_link.sql
-- Adiciona suporte a links clicáveis e metadados estruturados nas notificações do sistema

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb;
