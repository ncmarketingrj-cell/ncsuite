-- Supabase Migration: Funnel Builder Schema

-- 1. Tabela Principal de Funis (Graph Containers)
CREATE TABLE public.funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  global_settings JSONB DEFAULT '{}'::jsonb,
  viewport_state JSONB DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_funnels_user ON public.funnels(user_id);
CREATE INDEX idx_funnels_tenant ON public.funnels(tenant_id);

-- 2. Nodes (Vértices do Grafo)
CREATE TABLE public.funnel_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_nodes_funnel ON public.funnel_nodes(funnel_id);

-- 3. Edges (Arestas/Conexões Direcionadas)
CREATE TABLE public.funnel_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.funnel_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.funnel_nodes(id) ON DELETE CASCADE,
  condition_type TEXT DEFAULT 'default',
  condition_payload JSONB DEFAULT '{}'::jsonb,
  ui_settings JSONB DEFAULT '{"color": "#cbd5e1", "animated": false}'::jsonb
);

CREATE INDEX idx_funnel_edges_funnel ON public.funnel_edges(funnel_id);
CREATE INDEX idx_funnel_edges_source ON public.funnel_edges(source_node_id);
CREATE INDEX idx_funnel_edges_target ON public.funnel_edges(target_node_id);

-- 4. Sticky Contacts & Event Tracking (O lead viajando pelo grafo)
CREATE TABLE public.funnel_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  lead_id UUID, -- Referência solta para futura integração com CRM
  browser_fingerprint TEXT,
  session_token TEXT UNIQUE NOT NULL,
  utm_data JSONB DEFAULT '{}'::jsonb,
  current_node_id UUID REFERENCES public.funnel_nodes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_sessions_funnel ON public.funnel_sessions(funnel_id);
CREATE INDEX idx_funnel_sessions_token ON public.funnel_sessions(session_token);

CREATE TABLE public.funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.funnel_sessions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES public.funnel_nodes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_events_session ON public.funnel_events(session_id);

-- 5. Row Level Security (RLS)
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Políticas baseadas no Owner (user_id)
CREATE POLICY "Users manage own funnels"
  ON public.funnels FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own funnel nodes"
  ON public.funnel_nodes FOR ALL
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own funnel edges"
  ON public.funnel_edges FOR ALL
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE user_id = auth.uid()));

-- Políticas de visualização e gerenciamento de sessões/eventos de funil pelo dono do funil
CREATE POLICY "Users view own funnel sessions"
  ON public.funnel_sessions FOR SELECT
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE user_id = auth.uid()));

CREATE POLICY "Users view own funnel events"
  ON public.funnel_events FOR SELECT
  USING (session_id IN (
    SELECT fs.id FROM public.funnel_sessions fs
    JOIN public.funnels f ON fs.funnel_id = f.id
    WHERE f.user_id = auth.uid()
  ));

-- NOTA: Insert/Update em funnel_sessions e funnel_events seria feito por Edge Functions 
-- com role postgres (Service Role), portanto não precisamos expor permissões de escrita abertas para anônimos aqui.
