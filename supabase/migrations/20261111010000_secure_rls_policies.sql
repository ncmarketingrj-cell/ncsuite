-- ==============================================================================
-- MIGRATION: 20261111010000_secure_rls_policies.sql
-- Substituto seguro para as políticas permissivas (USING true / WITH CHECK true)
-- Elimina os 6 alertas críticos de segurança do Lovable / Supabase Linter
-- ==============================================================================

-- 1. CLIENTS
DROP POLICY IF EXISTS "clients all auth" ON public.clients;
DROP POLICY IF EXISTS "clients_auth_policy" ON public.clients;
CREATE POLICY "clients_auth_policy" ON public.clients
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  );

-- 2. CAMPAIGNS
DROP POLICY IF EXISTS "campaigns all auth" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_auth_policy" ON public.campaigns;
CREATE POLICY "campaigns_auth_policy" ON public.campaigns
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

-- 3. METRICS
DROP POLICY IF EXISTS "metrics all auth" ON public.metrics;
DROP POLICY IF EXISTS "metrics_auth_policy" ON public.metrics;
CREATE POLICY "metrics_auth_policy" ON public.metrics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

-- 4. REPORTS
DROP POLICY IF EXISTS "reports all auth" ON public.reports;
DROP POLICY IF EXISTS "reports_auth_policy" ON public.reports;
CREATE POLICY "reports_auth_policy" ON public.reports
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  );

-- 5. REPORT TEMPLATES
DROP POLICY IF EXISTS "report_templates all auth" ON public.report_templates;
DROP POLICY IF EXISTS "report_templates_auth_policy" ON public.report_templates;
CREATE POLICY "report_templates_auth_policy" ON public.report_templates
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_default = true
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  );

-- 6. BACKGROUND JOBS
DROP POLICY IF EXISTS "background_jobs all auth" ON public.background_jobs;
DROP POLICY IF EXISTS "background_jobs_auth_policy" ON public.background_jobs;
CREATE POLICY "background_jobs_auth_policy" ON public.background_jobs
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'employee')
    )
  );
