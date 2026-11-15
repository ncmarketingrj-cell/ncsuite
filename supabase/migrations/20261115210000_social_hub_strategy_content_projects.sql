-- ============================================================================
-- SOCIAL HUB EVOLUÇÃO: Estratégia, Conteúdo & Aprovação, Testes & Aprendizados e Projetos
-- Compatível com RBAC existente (public.is_agency_staff() / public.my_client_id())
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_social_hub_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Estratégia persistente por conta social
CREATE TABLE IF NOT EXISTS public.social_account_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL UNIQUE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  account_name text NOT NULL DEFAULT '',
  is_automotive boolean NOT NULL DEFAULT false,
  primary_objective text NOT NULL DEFAULT '',
  secondary_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_audience text NOT NULL DEFAULT '',
  audience_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  positioning text NOT NULL DEFAULT '',
  differentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone_of_voice text NOT NULL DEFAULT '',
  language_guidelines text NOT NULL DEFAULT '',
  editorial_pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_claims text NOT NULL DEFAULT '',
  restrictions text NOT NULL DEFAULT '',
  competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
  seasonality jsonb NOT NULL DEFAULT '[]'::jsonb,
  ctas_by_objective jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_account_strategies_client_id
  ON public.social_account_strategies(client_id);

DROP TRIGGER IF EXISTS trg_social_account_strategies_updated_at ON public.social_account_strategies;
CREATE TRIGGER trg_social_account_strategies_updated_at
  BEFORE UPDATE ON public.social_account_strategies
  FOR EACH ROW EXECUTE FUNCTION public.set_social_hub_updated_at();

ALTER TABLE public.social_account_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_strategies_agency_all" ON public.social_account_strategies;
CREATE POLICY "social_strategies_agency_all"
  ON public.social_account_strategies FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "social_strategies_client_select" ON public.social_account_strategies;
CREATE POLICY "social_strategies_client_select"
  ON public.social_account_strategies FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.my_client_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_account_strategies TO authenticated;

-- 2. Itens de Conteúdo, Ideias, Roteiros & Fluxo de Aprovação
CREATE TABLE IF NOT EXISTS public.social_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  account_name text NOT NULL DEFAULT '',
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'idea'
    CHECK (stage IN ('idea', 'briefing', 'production', 'internal_review', 'client_approval', 'scheduled', 'published', 'learning')),
  format text NOT NULL DEFAULT 'Reels',
  platform text NOT NULL DEFAULT 'instagram',
  objective text NOT NULL DEFAULT '',
  editorial_pillar text NOT NULL DEFAULT '',
  audience_segment text NOT NULL DEFAULT '',
  origin_insight text NOT NULL DEFAULT '',
  hypothesis text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
  effort text NOT NULL DEFAULT 'medio'
    CHECK (effort IN ('baixo', 'medio', 'alto')),
  hook_variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  script_scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  shot_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  on_screen_text text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  cover_suggestion text NOT NULL DEFAULT '',
  brief_notes text NOT NULL DEFAULT '',
  related_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_grounding jsonb,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_name text NOT NULL DEFAULT '',
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name text NOT NULL DEFAULT '',
  due_at timestamptz,
  scheduled_at timestamptz,
  published_url text,
  planner_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  meta_post_id text,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_content_items_page_stage
  ON public.social_content_items(page_id, stage);
CREATE INDEX IF NOT EXISTS idx_social_content_items_assignee_due
  ON public.social_content_items(assignee_id, due_at);
CREATE INDEX IF NOT EXISTS idx_social_content_items_client_id
  ON public.social_content_items(client_id);

DROP TRIGGER IF EXISTS trg_social_content_items_updated_at ON public.social_content_items;
CREATE TRIGGER trg_social_content_items_updated_at
  BEFORE UPDATE ON public.social_content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_social_hub_updated_at();

ALTER TABLE public.social_content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_content_agency_all" ON public.social_content_items;
CREATE POLICY "social_content_agency_all"
  ON public.social_content_items FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "social_content_client_select" ON public.social_content_items;
CREATE POLICY "social_content_client_select"
  ON public.social_content_items FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.my_client_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_content_items TO authenticated;

-- 3. Testes de Conteúdo
CREATE TABLE IF NOT EXISTS public.social_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  account_name text NOT NULL DEFAULT '',
  title text NOT NULL,
  hypothesis text NOT NULL,
  primary_variable text NOT NULL,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience_context text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'Reels',
  objective text NOT NULL DEFAULT '',
  primary_metric text NOT NULL DEFAULT 'engagement_rate',
  window_start date,
  window_end date,
  closure_criteria text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'concluded', 'inconclusive', 'cancelled')),
  is_manual_meta_native boolean NOT NULL DEFAULT false,
  sample_count integer NOT NULL DEFAULT 0,
  observed_result_summary text NOT NULL DEFAULT '',
  sample_notes text NOT NULL DEFAULT '',
  conclusion_status text NOT NULL DEFAULT 'pending'
    CHECK (conclusion_status IN ('pending', 'validated', 'refuted', 'inconclusive', 'insufficient_sample')),
  learning_notes text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  linked_content_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_experiments_page_status
  ON public.social_experiments(page_id, status);
CREATE INDEX IF NOT EXISTS idx_social_experiments_client_id
  ON public.social_experiments(client_id);

DROP TRIGGER IF EXISTS trg_social_experiments_updated_at ON public.social_experiments;
CREATE TRIGGER trg_social_experiments_updated_at
  BEFORE UPDATE ON public.social_experiments
  FOR EACH ROW EXECUTE FUNCTION public.set_social_hub_updated_at();

ALTER TABLE public.social_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_experiments_agency_all" ON public.social_experiments;
CREATE POLICY "social_experiments_agency_all"
  ON public.social_experiments FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "social_experiments_client_select" ON public.social_experiments;
CREATE POLICY "social_experiments_client_select"
  ON public.social_experiments FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.my_client_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_experiments TO authenticated;

-- 4. Banco de Aprendizados Sociais
CREATE TABLE IF NOT EXISTS public.social_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  account_name text NOT NULL DEFAULT '',
  title text NOT NULL,
  category text NOT NULL DEFAULT 'conteudo',
  observation text NOT NULL,
  evidence_summary text NOT NULL DEFAULT '',
  evidence_post_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  period_label text NOT NULL DEFAULT '',
  sample_coverage text NOT NULL DEFAULT '',
  ai_generated boolean NOT NULL DEFAULT false,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'confirmed', 'corrected', 'rejected')),
  human_correction text,
  actionable_next_step text NOT NULL DEFAULT '',
  linked_experiment_id uuid REFERENCES public.social_experiments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_learnings_page_status
  ON public.social_learnings(page_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_social_learnings_client_id
  ON public.social_learnings(client_id);

DROP TRIGGER IF EXISTS trg_social_learnings_updated_at ON public.social_learnings;
CREATE TRIGGER trg_social_learnings_updated_at
  BEFORE UPDATE ON public.social_learnings
  FOR EACH ROW EXECUTE FUNCTION public.set_social_hub_updated_at();

ALTER TABLE public.social_learnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_learnings_agency_all" ON public.social_learnings;
CREATE POLICY "social_learnings_agency_all"
  ON public.social_learnings FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "social_learnings_client_select" ON public.social_learnings;
CREATE POLICY "social_learnings_client_select"
  ON public.social_learnings FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.my_client_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_learnings TO authenticated;

-- 5. Tarefas & Projetos Operacionais (integradas a perfis, conteúdos, análises e notificações)
CREATE TABLE IF NOT EXISTS public.social_project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  account_name text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT 'producao',
  priority text NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'review', 'waiting_approval', 'blocked', 'done', 'cancelled')),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_name text NOT NULL DEFAULT '',
  due_at timestamptz,
  recurrence_rule text,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'idea', 'content', 'recommendation', 'experiment', 'approval', 'learning')),
  source_id text,
  linked_content_id uuid REFERENCES public.social_content_items(id) ON DELETE SET NULL,
  linked_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  linked_experiment_id uuid REFERENCES public.social_experiments(id) ON DELETE SET NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_project_tasks_page_status
  ON public.social_project_tasks(page_id, status);
CREATE INDEX IF NOT EXISTS idx_social_project_tasks_assignee_due
  ON public.social_project_tasks(assignee_id, due_at);
CREATE INDEX IF NOT EXISTS idx_social_project_tasks_client_id
  ON public.social_project_tasks(client_id);

DROP TRIGGER IF EXISTS trg_social_project_tasks_updated_at ON public.social_project_tasks;
CREATE TRIGGER trg_social_project_tasks_updated_at
  BEFORE UPDATE ON public.social_project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_social_hub_updated_at();

ALTER TABLE public.social_project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_project_tasks_agency_all" ON public.social_project_tasks;
CREATE POLICY "social_project_tasks_agency_all"
  ON public.social_project_tasks FOR ALL TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "social_project_tasks_client_select" ON public.social_project_tasks;
CREATE POLICY "social_project_tasks_client_select"
  ON public.social_project_tasks FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.my_client_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_project_tasks TO authenticated;

NOTIFY pgrst, 'reload schema';
