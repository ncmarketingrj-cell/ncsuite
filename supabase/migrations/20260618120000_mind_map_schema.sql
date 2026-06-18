-- Mind Map Hub Schema

CREATE TABLE IF NOT EXISTS public.mind_maps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Novo Mapa Mental',
  description TEXT,
  layout      TEXT NOT NULL DEFAULT 'radial' CHECK (layout IN ('radial','tree','list','free')),
  theme       TEXT NOT NULL DEFAULT 'dark',
  bg_color    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mind_map_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.mind_maps(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES public.mind_map_nodes(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Tópico',
  emoji       TEXT,
  note        TEXT,
  color       TEXT DEFAULT '#e11d48',
  bg_color    TEXT,
  font_size   INTEGER DEFAULT 14,
  bold        BOOLEAN DEFAULT false,
  pos_x       NUMERIC DEFAULT 0,
  pos_y       NUMERIC DEFAULT 0,
  width       NUMERIC DEFAULT 180,
  collapsed   BOOLEAN DEFAULT false,
  is_floating BOOLEAN DEFAULT false,
  slide_order INTEGER,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mind_map_edges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id     UUID NOT NULL REFERENCES public.mind_maps(id) ON DELETE CASCADE,
  source_id  UUID NOT NULL REFERENCES public.mind_map_nodes(id) ON DELETE CASCADE,
  target_id  UUID NOT NULL REFERENCES public.mind_map_nodes(id) ON DELETE CASCADE,
  label      TEXT,
  style      TEXT DEFAULT 'bezier' CHECK (style IN ('bezier','straight','step','smoothstep')),
  color      TEXT DEFAULT '#6b7280',
  animated   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mind_maps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_map_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_map_edges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mind_maps' AND policyname='mind_maps_owner') THEN
    CREATE POLICY "mind_maps_owner" ON public.mind_maps FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mind_map_nodes' AND policyname='mind_map_nodes_owner') THEN
    CREATE POLICY "mind_map_nodes_owner" ON public.mind_map_nodes FOR ALL
      USING (map_id IN (SELECT id FROM public.mind_maps WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mind_map_edges' AND policyname='mind_map_edges_owner') THEN
    CREATE POLICY "mind_map_edges_owner" ON public.mind_map_edges FOR ALL
      USING (map_id IN (SELECT id FROM public.mind_maps WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mind_maps_user_idx       ON public.mind_maps(user_id);
CREATE INDEX IF NOT EXISTS mind_map_nodes_map_idx   ON public.mind_map_nodes(map_id);
CREATE INDEX IF NOT EXISTS mind_map_nodes_parent_idx ON public.mind_map_nodes(parent_id);
CREATE INDEX IF NOT EXISTS mind_map_edges_map_idx   ON public.mind_map_edges(map_id);

CREATE OR REPLACE FUNCTION public.set_mind_maps_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_mind_maps_updated_at ON public.mind_maps;
CREATE TRIGGER trg_mind_maps_updated_at
  BEFORE UPDATE ON public.mind_maps
  FOR EACH ROW EXECUTE FUNCTION public.set_mind_maps_updated_at();
