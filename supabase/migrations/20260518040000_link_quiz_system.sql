-- ═══════════════════════════════════════════════════════════════
-- LINK MANAGEMENT + QUIZ SYSTEM — NC Performance Suite
-- Agência Automotiva (Carros & Motos)
-- ═══════════════════════════════════════════════════════════════

-- ═══ LINK PAGES: Adicionar colunas de customização ═══
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS bg_color text DEFAULT '#0a0a0a';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#e02020';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Outfit';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS template text DEFAULT 'garage-premium';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS button_style text DEFAULT 'rounded';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]';
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS lead_form_enabled boolean DEFAULT false;
ALTER TABLE public.link_pages ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ═══ LINK ITEMS (botões de link em cada página) ═══
CREATE TABLE IF NOT EXISTS public.link_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES public.link_pages(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  icon text,
  type text DEFAULT 'link',         -- link | youtube | whatsapp | phone | stock
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  click_count integer DEFAULT 0,
  whatsapp_message text,            -- mensagem personalizada para WhatsApp
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.link_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "link_items all auth" ON public.link_items;
CREATE POLICY "link_items all auth" ON public.link_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode ler (página pública)
DROP POLICY IF EXISTS "link_items anon read" ON public.link_items;
CREATE POLICY "link_items anon read" ON public.link_items FOR SELECT TO anon USING (true);

-- ═══ LINK CLICKS (analytics de cliques em tempo real) ═══
CREATE TABLE IF NOT EXISTS public.link_clicks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid REFERENCES public.link_items(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.link_pages(id) ON DELETE CASCADE,
  referrer text,
  user_agent text,
  clicked_at timestamptz DEFAULT now()
);
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "link_clicks all auth" ON public.link_clicks;
CREATE POLICY "link_clicks all auth" ON public.link_clicks FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode inserir (visitante clica)
DROP POLICY IF EXISTS "link_clicks anon insert" ON public.link_clicks;
CREATE POLICY "link_clicks anon insert" ON public.link_clicks FOR INSERT TO anon WITH CHECK (true);

-- ═══ LEAD CAPTURES (formulários de captura) ═══
CREATE TABLE IF NOT EXISTS public.lead_captures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES public.link_pages(id) ON DELETE SET NULL,
  quiz_id uuid,
  name text,
  email text,
  phone text,
  vehicle_interest text,
  source text DEFAULT 'link_page',    -- link_page | quiz
  captured_at timestamptz DEFAULT now()
);
ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_captures all auth" ON public.lead_captures;
CREATE POLICY "lead_captures all auth" ON public.lead_captures FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode inserir (visitante envia formulário)
DROP POLICY IF EXISTS "lead_captures anon insert" ON public.lead_captures;
CREATE POLICY "lead_captures anon insert" ON public.lead_captures FOR INSERT TO anon WITH CHECK (true);

-- ═══ QUIZZES ═══
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  theme_color text DEFAULT '#e02020',
  bg_color text DEFAULT '#0a0a0a',
  is_active boolean DEFAULT true,
  lead_form_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quizzes all auth" ON public.quizzes;
CREATE POLICY "quizzes all auth" ON public.quizzes FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode ler (página pública do quiz)
DROP POLICY IF EXISTS "quizzes anon read" ON public.quizzes;
CREATE POLICY "quizzes anon read" ON public.quizzes FOR SELECT TO anon USING (true);

-- ═══ QUIZ STEPS (com ramificação condicional) ═══
CREATE TABLE IF NOT EXISTS public.quiz_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  step_type text DEFAULT 'choice',    -- choice | image_choice | text_input | info
  options jsonb DEFAULT '[]',         -- ["Opção A", "Opção B"]
  image_options jsonb DEFAULT '[]',   -- [{url, label, value}]
  next_step_map jsonb DEFAULT '{}',   -- {"Opção A": "step_id_x"} para ramificação
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.quiz_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_steps all auth" ON public.quiz_steps;
CREATE POLICY "quiz_steps all auth" ON public.quiz_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode ler
DROP POLICY IF EXISTS "quiz_steps anon read" ON public.quiz_steps;
CREATE POLICY "quiz_steps anon read" ON public.quiz_steps FOR SELECT TO anon USING (true);

-- ═══ QUIZ SUBMISSIONS ═══
CREATE TABLE IF NOT EXISTS public.quiz_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE CASCADE,
  answers jsonb DEFAULT '{}',
  lead_name text,
  lead_phone text,
  lead_email text,
  vehicle_interest text,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_submissions all auth" ON public.quiz_submissions;
CREATE POLICY "quiz_submissions all auth" ON public.quiz_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Anon pode inserir (visitante submete quiz)
DROP POLICY IF EXISTS "quiz_submissions anon insert" ON public.quiz_submissions;
CREATE POLICY "quiz_submissions anon insert" ON public.quiz_submissions FOR INSERT TO anon WITH CHECK (true);

-- ═══ LINK PAGES: Anon pode ler (página pública) ═══
DROP POLICY IF EXISTS "link_pages anon read" ON public.link_pages;
CREATE POLICY "link_pages anon read" ON public.link_pages FOR SELECT TO anon USING (true);

-- ═══ Indexes para performance ═══
CREATE INDEX IF NOT EXISTS idx_link_items_page_id ON public.link_items(page_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_page_id ON public.link_clicks(page_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_item_id ON public.link_clicks(item_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON public.link_clicks(clicked_at);
CREATE INDEX IF NOT EXISTS idx_lead_captures_page_id ON public.lead_captures(page_id);
CREATE INDEX IF NOT EXISTS idx_quiz_steps_quiz_id ON public.quiz_steps(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON public.quiz_submissions(quiz_id);
