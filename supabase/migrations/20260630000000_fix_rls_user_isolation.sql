-- =================================================================
-- FIX RLS: substituir USING(true) por isolamento correto
-- =================================================================
-- Estratégia:
--   1. Tabelas pessoais → user_id = auth.uid()
--   2. Tabelas da agência → funcionários veem tudo;
--      client_store vê apenas dados do seu cliente
--   3. Tabelas públicas (link_clicks, lead_captures, etc.) → mantidas
-- =================================================================

-- Funções auxiliares (SECURITY DEFINER para leitura segura de profiles)

CREATE OR REPLACE FUNCTION public.is_agency_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN (
      'admin','master_admin','ceo','gerente',
      'gestor_trafego','social_media','videomaker','outro','agency_sdr'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

-- =================================================================
-- 1. TABELAS PESSOAIS — user_id = auth.uid()
-- =================================================================

-- notifications
DROP POLICY IF EXISTS "notifications all auth" ON public.notifications;
CREATE POLICY "notifications own" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- alerts
DROP POLICY IF EXISTS "alerts all auth" ON public.alerts;
CREATE POLICY "alerts own" ON public.alerts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- agent_memory
DROP POLICY IF EXISTS "agent_memory all auth" ON public.agent_memory;
CREATE POLICY "agent_memory own" ON public.agent_memory
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- agent_actions_log
DROP POLICY IF EXISTS "agent_actions_log all auth" ON public.agent_actions_log;
CREATE POLICY "agent_actions_log own" ON public.agent_actions_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- background_jobs
DROP POLICY IF EXISTS "background_jobs all auth" ON public.background_jobs;
CREATE POLICY "background_jobs own" ON public.background_jobs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- automation_rules
DROP POLICY IF EXISTS "automation_rules all auth" ON public.automation_rules;
CREATE POLICY "automation_rules own" ON public.automation_rules
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- automation_logs
DROP POLICY IF EXISTS "automation_logs all auth" ON public.automation_logs;
CREATE POLICY "automation_logs own" ON public.automation_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- campaign_schedules
DROP POLICY IF EXISTS "campaign_schedules all auth" ON public.campaign_schedules;
CREATE POLICY "campaign_schedules own" ON public.campaign_schedules
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- sync_history
DROP POLICY IF EXISTS "sync_history all auth" ON public.sync_history;
CREATE POLICY "sync_history own" ON public.sync_history
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- alert_thresholds
DROP POLICY IF EXISTS "alert_thresholds all auth" ON public.alert_thresholds;
CREATE POLICY "alert_thresholds own" ON public.alert_thresholds
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- swipe_files
DROP POLICY IF EXISTS "swipe_files all auth" ON public.swipe_files;
CREATE POLICY "swipe_files own" ON public.swipe_files
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- reports
DROP POLICY IF EXISTS "reports all auth" ON public.reports;
CREATE POLICY "reports own" ON public.reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- report_templates
DROP POLICY IF EXISTS "report_templates all auth" ON public.report_templates;
CREATE POLICY "report_templates own" ON public.report_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- campaign_portfolios
DROP POLICY IF EXISTS "campaign_portfolios all auth" ON public.campaign_portfolios;
CREATE POLICY "campaign_portfolios own" ON public.campaign_portfolios
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- portfolio_campaigns (via portfolio_id → campaign_portfolios.user_id)
DROP POLICY IF EXISTS "portfolio_campaigns all auth" ON public.portfolio_campaigns;
CREATE POLICY "portfolio_campaigns own" ON public.portfolio_campaigns
  FOR ALL TO authenticated
  USING (
    portfolio_id IN (SELECT id FROM public.campaign_portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM public.campaign_portfolios WHERE user_id = auth.uid())
  );

-- meta_ads_configs
DROP POLICY IF EXISTS "meta_ads_configs all auth" ON public.meta_ads_configs;
CREATE POLICY "meta_ads_configs own" ON public.meta_ads_configs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- link_pages (mantém anon read existente; restringe auth ao dono)
DROP POLICY IF EXISTS "link_pages all auth" ON public.link_pages;
CREATE POLICY "link_pages own" ON public.link_pages
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- link_items (mantém anon read existente)
DROP POLICY IF EXISTS "link_items all auth" ON public.link_items;
CREATE POLICY "link_items own" ON public.link_items
  FOR ALL TO authenticated
  USING (
    page_id IN (SELECT id FROM public.link_pages WHERE user_id = auth.uid())
  )
  WITH CHECK (
    page_id IN (SELECT id FROM public.link_pages WHERE user_id = auth.uid())
  );

-- quizzes (mantém anon read existente)
DROP POLICY IF EXISTS "quizzes all auth" ON public.quizzes;
CREATE POLICY "quizzes own" ON public.quizzes
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- quiz_steps (mantém anon read existente)
DROP POLICY IF EXISTS "quiz_steps all auth" ON public.quiz_steps;
CREATE POLICY "quiz_steps own" ON public.quiz_steps
  FOR ALL TO authenticated
  USING (
    quiz_id IN (SELECT id FROM public.quizzes WHERE user_id = auth.uid())
  )
  WITH CHECK (
    quiz_id IN (SELECT id FROM public.quizzes WHERE user_id = auth.uid())
  );

-- =================================================================
-- 2. TABELAS DA AGÊNCIA — staff vê tudo; client_store vê só o seu
-- =================================================================

-- clients
DROP POLICY IF EXISTS "clients all auth" ON public.clients;
CREATE POLICY "clients agency_staff" ON public.clients
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "clients own_client_store" ON public.clients
  FOR SELECT TO authenticated
  USING (id = public.my_client_id());

-- ad_accounts (interno da agência, client_store não precisa de acesso)
DROP POLICY IF EXISTS "ad_accounts all auth" ON public.ad_accounts;
CREATE POLICY "ad_accounts agency_staff" ON public.ad_accounts
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- campaigns
DROP POLICY IF EXISTS "campaigns all auth" ON public.campaigns;
CREATE POLICY "campaigns agency_staff" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "campaigns own_client_store" ON public.campaigns
  FOR SELECT TO authenticated
  USING (client_id = public.my_client_id());

-- metrics
DROP POLICY IF EXISTS "metrics all auth" ON public.metrics;
CREATE POLICY "metrics agency_staff" ON public.metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "metrics own_client_store" ON public.metrics
  FOR SELECT TO authenticated
  USING (client_id = public.my_client_id());

-- ad_sets
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ad_sets;
CREATE POLICY "ad_sets agency_staff" ON public.ad_sets
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "ad_sets own_client_store" ON public.ad_sets
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE client_id = public.my_client_id()
    )
  );

-- ads
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ads;
CREATE POLICY "ads agency_staff" ON public.ads
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "ads own_client_store" ON public.ads
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE client_id = public.my_client_id()
    )
  );

-- asset_metrics
DROP POLICY IF EXISTS "Enable read access for all users" ON public.asset_metrics;
CREATE POLICY "asset_metrics agency_staff" ON public.asset_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- hourly_metrics
DROP POLICY IF EXISTS "hourly_metrics all auth" ON public.hourly_metrics;
CREATE POLICY "hourly_metrics agency_staff" ON public.hourly_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- region_metrics
DROP POLICY IF EXISTS "region_metrics all auth" ON public.region_metrics;
CREATE POLICY "region_metrics agency_staff" ON public.region_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- placement_metrics
DROP POLICY IF EXISTS "placement_metrics all auth" ON public.placement_metrics;
CREATE POLICY "placement_metrics agency_staff" ON public.placement_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- device_metrics
DROP POLICY IF EXISTS "device_metrics all auth" ON public.device_metrics;
CREATE POLICY "device_metrics agency_staff" ON public.device_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- demographic_metrics
DROP POLICY IF EXISTS "demographic_metrics all auth" ON public.demographic_metrics;
CREATE POLICY "demographic_metrics agency_staff" ON public.demographic_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- meta_placement_metrics
DROP POLICY IF EXISTS "meta_placement_metrics_read_all" ON public.meta_placement_metrics;
CREATE POLICY "meta_placement_metrics agency_staff" ON public.meta_placement_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- meta_device_metrics
DROP POLICY IF EXISTS "meta_device_metrics_read_all" ON public.meta_device_metrics;
CREATE POLICY "meta_device_metrics agency_staff" ON public.meta_device_metrics
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- meta_period_stats
DROP POLICY IF EXISTS "meta_period_stats_read_all" ON public.meta_period_stats;
CREATE POLICY "meta_period_stats agency_staff" ON public.meta_period_stats
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- client_notes (staff vê tudo; client_store vê só o seu)
DROP POLICY IF EXISTS "Allow all actions for authenticated users on client_notes" ON public.client_notes;
CREATE POLICY "client_notes agency_staff" ON public.client_notes
  FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "client_notes own_client_store" ON public.client_notes
  FOR SELECT TO authenticated
  USING (client_id = public.my_client_id());
