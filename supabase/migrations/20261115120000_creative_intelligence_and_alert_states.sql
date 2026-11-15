-- Creative Intelligence Hub (/criativos) + Non-Destructive Global Alert User States
-- Additive, backwards-compatible migration with strict agency/client_store RLS

-- 1. Optional creative metadata on synced Meta ads
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS creative_body text,
  ADD COLUMN IF NOT EXISTS creative_title text,
  ADD COLUMN IF NOT EXISTS creative_format text,
  ADD COLUMN IF NOT EXISTS creative_image_url text;

-- 2. Brand Kits per Client / Ad Account
CREATE TABLE IF NOT EXISTS public.creative_brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_account_id text REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#E11D48',
  secondary_color text NOT NULL DEFAULT '#111827',
  accent_color text NOT NULL DEFAULT '#F59E0B',
  font_family text NOT NULL DEFAULT 'Inter',
  tone_of_voice text,
  brand_rules text,
  restrictions text,
  reference_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_brand_kits_ad_account
  ON public.creative_brand_kits(ad_account_id)
  WHERE ad_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_brand_kits_client
  ON public.creative_brand_kits(client_id)
  WHERE client_id IS NOT NULL;

ALTER TABLE public.creative_brand_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_agency_staff_full_access" ON public.creative_brand_kits;
CREATE POLICY "nc_agency_staff_full_access"
  ON public.creative_brand_kits
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "creative_brand_kits_client_read" ON public.creative_brand_kits;
CREATE POLICY "creative_brand_kits_client_read"
  ON public.creative_brand_kits
  FOR SELECT
  TO authenticated
  USING (
    client_id = public.my_client_id()
    OR ad_account_id IN (
      SELECT c.meta_ad_account_id
      FROM public.clients c
      WHERE c.id = public.my_client_id() AND c.meta_ad_account_id IS NOT NULL
    )
  );

-- 3. Creative Tests Planner & Experiments Log
CREATE TABLE IF NOT EXISTS public.creative_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ad_set_id uuid REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  title text NOT NULL,
  business_question text NOT NULL,
  test_type text NOT NULL DEFAULT 'controlled_single_var',
  objective text,
  optimization_goal text,
  result_unit text,
  target_audience_context text,
  hypothesis_category text NOT NULL DEFAULT 'hook',
  hypothesis_text text NOT NULL,
  primary_variable text NOT NULL,
  kept_constants text,
  evaluation_criteria text NOT NULL,
  participant_ad_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  participant_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planned',
  observed_result_summary text,
  learning_notes text,
  next_decision text NOT NULL DEFAULT 'collect_more_data',
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_creative_tests_type CHECK (
    test_type IN ('controlled_single_var', 'concept_exploration', 'observational_comparison')
  ),
  CONSTRAINT chk_creative_tests_status CHECK (
    status IN ('planned', 'running', 'inconclusive', 'concluded', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_creative_tests_account_status
  ON public.creative_tests(ad_account_id, status);

CREATE INDEX IF NOT EXISTS idx_creative_tests_campaign
  ON public.creative_tests(campaign_id);

ALTER TABLE public.creative_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_agency_staff_full_access" ON public.creative_tests;
CREATE POLICY "nc_agency_staff_full_access"
  ON public.creative_tests
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS "creative_tests_client_read" ON public.creative_tests;
CREATE POLICY "creative_tests_client_read"
  ON public.creative_tests
  FOR SELECT
  TO authenticated
  USING (
    client_id = public.my_client_id()
    OR ad_account_id IN (
      SELECT c.meta_ad_account_id
      FROM public.clients c
      WHERE c.id = public.my_client_id() AND c.meta_ad_account_id IS NOT NULL
    )
  );

-- 4. Extend swipe_files safely to persist creative assets, versions, approvals & links
ALTER TABLE public.swipe_files
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_ad_id uuid REFERENCES public.ads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creative_test_id uuid REFERENCES public.creative_tests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.swipe_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS layer_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS author_id uuid,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS change_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_swipe_files_account
  ON public.swipe_files(ad_account_id);

CREATE INDEX IF NOT EXISTS idx_swipe_files_test
  ON public.swipe_files(creative_test_id);

DROP POLICY IF EXISTS "swipe_files_client_read" ON public.swipe_files;
CREATE POLICY "swipe_files_client_read"
  ON public.swipe_files
  FOR SELECT
  TO authenticated
  USING (
    client_id = public.my_client_id()
    OR ad_account_id IN (
      SELECT c.meta_ad_account_id
      FROM public.clients c
      WHERE c.id = public.my_client_id() AND c.meta_ad_account_id IS NOT NULL
    )
  );

-- 5. Per-user non-destructive read/dismiss state for Global Notifications
CREATE TABLE IF NOT EXISTS public.notification_user_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  is_dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_user_state UNIQUE (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_lookup
  ON public.notification_user_states(user_id, is_dismissed, is_read);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_notif
  ON public.notification_user_states(notification_id);

ALTER TABLE public.notification_user_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_user_states_own" ON public.notification_user_states;
CREATE POLICY "notification_user_states_own"
  ON public.notification_user_states
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
