-- Migration: Adicionar suporte a alertas de Redes Sociais, parametrização do motor e RLS restrita para logs de sync
-- Date: 2026-07-01

-- 1. Colunas adicionais na tabela alert_thresholds para Social Media
ALTER TABLE public.alert_thresholds
  ADD COLUMN IF NOT EXISTS social_page_id uuid REFERENCES public.social_pages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS min_ig_followers integer,
  ADD COLUMN IF NOT EXISTS min_fb_followers integer,
  ADD COLUMN IF NOT EXISTS max_days_without_posts integer,
  ADD COLUMN IF NOT EXISTS min_post_engagement_rate numeric(5,2);

-- 2. Colunas de controle dos Gatilhos Inteligentes (Smart Triggers) globais na tabela meta_ads_configs
ALTER TABLE public.meta_ads_configs
  ADD COLUMN IF NOT EXISTS zero_delivery_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS zero_delivery_hour integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS perf_drop_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS perf_drop_spend_pct numeric(5,2) DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS client_cpa_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_dedup_hours numeric(4,2) DEFAULT 2.00;

-- 3. Atualização de RLS na tabela sync_history (apenas administradores/chefes veem os logs)
DROP POLICY IF EXISTS "sync_history own" ON public.sync_history;
DROP POLICY IF EXISTS "sync_history all auth" ON public.sync_history;
DROP POLICY IF EXISTS "sync_history_admins" ON public.sync_history;

CREATE POLICY "sync_history_admins" ON public.sync_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'master_admin', 'ceo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'master_admin', 'ceo')
    )
  );

-- Recarregar schema
NOTIFY pgrst, 'reload schema';
