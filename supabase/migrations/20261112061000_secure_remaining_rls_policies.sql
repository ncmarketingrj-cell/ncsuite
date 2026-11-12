-- ==============================================================================
-- MIGRATION: 20261112061000_secure_remaining_rls_policies.sql
-- Substitui políticas legadas abertas (Enable read access for all users / USING true)
-- Elimina o alerta de segurança do Lovable Linter ("Some access rules let everyone through")
-- ==============================================================================

-- 1. AD_SETS (substituir leitura pública aberta por acesso apenas a usuários autenticados)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ad_sets;
DROP POLICY IF EXISTS "ad_sets_auth_policy" ON public.ad_sets;
CREATE POLICY "ad_sets_auth_policy" ON public.ad_sets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  );

-- 2. ADS
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ads;
DROP POLICY IF EXISTS "ads_auth_policy" ON public.ads;
CREATE POLICY "ads_auth_policy" ON public.ads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  );

-- 3. ASSET_METRICS
DROP POLICY IF EXISTS "Enable read access for all users" ON public.asset_metrics;
DROP POLICY IF EXISTS "asset_metrics_auth_policy" ON public.asset_metrics;
CREATE POLICY "asset_metrics_auth_policy" ON public.asset_metrics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  );

-- 4. CLIENT_NOTES
DROP POLICY IF EXISTS "client_notes_all" ON public.client_notes;
DROP POLICY IF EXISTS "client_notes_auth_policy" ON public.client_notes;
CREATE POLICY "client_notes_auth_policy" ON public.client_notes
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  );

-- 5. CRM_PIPELINES
DROP POLICY IF EXISTS "crm_pipelines_all" ON public.crm_pipelines;
DROP POLICY IF EXISTS "crm_pipelines_auth_policy" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_auth_policy" ON public.crm_pipelines
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'master_admin', 'ceo', 'diretor', 'gerente', 'coordenador', 'gestor_trafego', 'employee')
    )
  );

-- Recarregar o schema do PostgREST
NOTIFY pgrst, 'reload schema';

