-- Indexes for all FK columns on Social Hub tables + consolidated RLS policies (1 permissive policy per action)

CREATE INDEX IF NOT EXISTS idx_social_account_strategies_updated_by
  ON public.social_account_strategies(updated_by);

CREATE INDEX IF NOT EXISTS idx_social_content_items_approver_id
  ON public.social_content_items(approver_id);
CREATE INDEX IF NOT EXISTS idx_social_content_items_planner_post_id
  ON public.social_content_items(planner_post_id);
CREATE INDEX IF NOT EXISTS idx_social_content_items_created_by
  ON public.social_content_items(created_by);

CREATE INDEX IF NOT EXISTS idx_social_experiments_created_by
  ON public.social_experiments(created_by);

CREATE INDEX IF NOT EXISTS idx_social_learnings_linked_experiment_id
  ON public.social_learnings(linked_experiment_id);
CREATE INDEX IF NOT EXISTS idx_social_learnings_created_by
  ON public.social_learnings(created_by);
CREATE INDEX IF NOT EXISTS idx_social_learnings_validated_by
  ON public.social_learnings(validated_by);

CREATE INDEX IF NOT EXISTS idx_social_project_tasks_linked_content_id
  ON public.social_project_tasks(linked_content_id);
CREATE INDEX IF NOT EXISTS idx_social_project_tasks_linked_post_id
  ON public.social_project_tasks(linked_post_id);
CREATE INDEX IF NOT EXISTS idx_social_project_tasks_linked_experiment_id
  ON public.social_project_tasks(linked_experiment_id);
CREATE INDEX IF NOT EXISTS idx_social_project_tasks_created_by
  ON public.social_project_tasks(created_by);

-- Consolidate SELECT policies into a single permissive policy per table
DROP POLICY IF EXISTS "social_strategies_agency_all" ON public.social_account_strategies;
DROP POLICY IF EXISTS "social_strategies_client_select" ON public.social_account_strategies;
CREATE POLICY "social_strategies_select" ON public.social_account_strategies FOR SELECT TO authenticated
  USING (public.is_agency_staff() OR (client_id IS NOT NULL AND client_id = public.my_client_id()));
CREATE POLICY "social_strategies_insert" ON public.social_account_strategies FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_strategies_update" ON public.social_account_strategies FOR UPDATE TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_strategies_delete" ON public.social_account_strategies FOR DELETE TO authenticated
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS "social_content_agency_all" ON public.social_content_items;
DROP POLICY IF EXISTS "social_content_client_select" ON public.social_content_items;
CREATE POLICY "social_content_select" ON public.social_content_items FOR SELECT TO authenticated
  USING (public.is_agency_staff() OR (client_id IS NOT NULL AND client_id = public.my_client_id()));
CREATE POLICY "social_content_insert" ON public.social_content_items FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_content_update" ON public.social_content_items FOR UPDATE TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_content_delete" ON public.social_content_items FOR DELETE TO authenticated
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS "social_experiments_agency_all" ON public.social_experiments;
DROP POLICY IF EXISTS "social_experiments_client_select" ON public.social_experiments;
CREATE POLICY "social_experiments_select" ON public.social_experiments FOR SELECT TO authenticated
  USING (public.is_agency_staff() OR (client_id IS NOT NULL AND client_id = public.my_client_id()));
CREATE POLICY "social_experiments_insert" ON public.social_experiments FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_experiments_update" ON public.social_experiments FOR UPDATE TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_experiments_delete" ON public.social_experiments FOR DELETE TO authenticated
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS "social_learnings_agency_all" ON public.social_learnings;
DROP POLICY IF EXISTS "social_learnings_client_select" ON public.social_learnings;
CREATE POLICY "social_learnings_select" ON public.social_learnings FOR SELECT TO authenticated
  USING (public.is_agency_staff() OR (client_id IS NOT NULL AND client_id = public.my_client_id()));
CREATE POLICY "social_learnings_insert" ON public.social_learnings FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_learnings_update" ON public.social_learnings FOR UPDATE TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_learnings_delete" ON public.social_learnings FOR DELETE TO authenticated
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS "social_project_tasks_agency_all" ON public.social_project_tasks;
DROP POLICY IF EXISTS "social_project_tasks_client_select" ON public.social_project_tasks;
CREATE POLICY "social_project_tasks_select" ON public.social_project_tasks FOR SELECT TO authenticated
  USING (public.is_agency_staff() OR (client_id IS NOT NULL AND client_id = public.my_client_id()));
CREATE POLICY "social_project_tasks_insert" ON public.social_project_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_project_tasks_update" ON public.social_project_tasks FOR UPDATE TO authenticated
  USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
CREATE POLICY "social_project_tasks_delete" ON public.social_project_tasks FOR DELETE TO authenticated
  USING (public.is_agency_staff());

NOTIFY pgrst, 'reload schema';
