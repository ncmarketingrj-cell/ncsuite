-- Migração: Criação dos Módulos Unificados de Regras Operacionais e Notas por Conta de Anúncio
-- Data: 2026-11-12
-- Suporte a:
--   1. ad_account_rules (Políticas inegociáveis, severidade, escopo conta/campanha)
--   2. ad_account_notes (Timeline diária, categorias, campanhas vinculadas, fixação)
--   3. mind_maps.ad_account_id (Vinculação de Mapas Mentais a Contas de Anúncio)

-- 1. AD_ACCOUNT_RULES
CREATE TABLE IF NOT EXISTS public.ad_account_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Geral',
  severity TEXT NOT NULL DEFAULT 'alerta',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ad_account_rules_account_idx ON public.ad_account_rules(ad_account_id);
CREATE INDEX IF NOT EXISTS ad_account_rules_campaign_idx ON public.ad_account_rules(campaign_id);
CREATE INDEX IF NOT EXISTS ad_account_rules_active_idx ON public.ad_account_rules(is_active);

ALTER TABLE public.ad_account_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_account_rules_auth" ON public.ad_account_rules;
CREATE POLICY "ad_account_rules_auth" ON public.ad_account_rules
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. AD_ACCOUNT_NOTES
CREATE TABLE IF NOT EXISTS public.ad_account_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  tags TEXT[] DEFAULT '{}'::TEXT[],
  is_pinned BOOLEAN DEFAULT FALSE,
  note_date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ad_account_notes_account_idx ON public.ad_account_notes(ad_account_id);
CREATE INDEX IF NOT EXISTS ad_account_notes_date_idx ON public.ad_account_notes(note_date);
CREATE INDEX IF NOT EXISTS ad_account_notes_campaign_idx ON public.ad_account_notes(campaign_id);

ALTER TABLE public.ad_account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_account_notes_auth" ON public.ad_account_notes;
CREATE POLICY "ad_account_notes_auth" ON public.ad_account_notes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. VINCULAÇÃO DE MIND_MAPS COM AD_ACCOUNT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mind_maps' AND column_name = 'ad_account_id'
  ) THEN
    ALTER TABLE public.mind_maps ADD COLUMN ad_account_id TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mind_maps_ad_account_idx ON public.mind_maps(ad_account_id);

-- 4. ATUALIZAR TRIGGER UPDATED_AT SE EXISTIR
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ad_account_rules_updated_at ON public.ad_account_rules;
CREATE TRIGGER trigger_ad_account_rules_updated_at
  BEFORE UPDATE ON public.ad_account_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_ad_account_notes_updated_at ON public.ad_account_notes;
CREATE TRIGGER trigger_ad_account_notes_updated_at
  BEFORE UPDATE ON public.ad_account_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
