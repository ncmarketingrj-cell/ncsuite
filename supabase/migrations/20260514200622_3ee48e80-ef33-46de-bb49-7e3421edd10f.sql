
-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  agency_name text DEFAULT 'NC AGÊNCIA',
  role text DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  position text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, position, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    COALESCE(NEW.raw_user_meta_data->>'position',''),
    COALESCE(NEW.raw_user_meta_data->>'role','employee')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clients
CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text DEFAULT 'automotivo',
  monthly_budget numeric,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients all auth" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campaigns
CREATE TABLE public.campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  platform text DEFAULT 'Meta Ads',
  status text DEFAULT 'active',
  budget numeric,
  link text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns all auth" ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Metrics
CREATE TABLE public.metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  date date DEFAULT current_date,
  impressions integer,
  clicks integer,
  conversions integer,
  cost numeric,
  reach integer,
  result_type text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics all auth" ON public.metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reports
CREATE TABLE public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  period text,
  markdown text,
  raw_data jsonb,
  total_investment numeric,
  total_campaigns integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports all auth" ON public.reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Report templates
CREATE TABLE public.report_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  footer_text text DEFAULT '',
  is_default boolean DEFAULT false,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_templates all auth" ON public.report_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Background jobs
CREATE TABLE public.background_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  status text DEFAULT 'pending',
  progress integer DEFAULT 0,
  payload jsonb,
  result jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "background_jobs all auth" ON public.background_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
