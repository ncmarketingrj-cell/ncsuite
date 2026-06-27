-- Migration: Criar tabela chart_configs para personalização de gráficos
-- NC Performance Suite

CREATE TABLE IF NOT EXISTS public.chart_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL, -- line, area, bar, barh, pie, donut, composed, scatter, funnel
    metrics JSONB NOT NULL, -- ex: ["cost", "conversions"]
    colors JSONB NOT NULL, -- ex: {"cost": "#6366f1", "conversions": "#8b5cf6"}
    period TEXT NOT NULL DEFAULT '30d', -- 7d, 14d, 30d, 60d
    group_by TEXT NOT NULL DEFAULT 'day', -- day, week, month
    show_comparison BOOLEAN NOT NULL DEFAULT false,
    context TEXT NOT NULL, -- metricas, campanhas
    target_id TEXT, -- ex: id da campanha ou conta
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.chart_configs ENABLE ROW LEVEL SECURITY;

-- 1. Qualquer usuário autenticado pode visualizar os gráficos
CREATE POLICY "Permitir leitura para usuários autenticados" 
ON public.chart_configs
FOR SELECT
TO authenticated
USING (true);

-- 2. Permitir que o Admin faça qualquer operação em qualquer gráfico (incluindo Métricas)
CREATE POLICY "Permitir tudo para administradores"
ON public.chart_configs
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
);

-- 3. Permitir que usuários normais gerenciem apenas seus próprios gráficos no contexto 'campanhas'
CREATE POLICY "Permitir que usuários gerenciem seus gráficos de campanhas"
ON public.chart_configs
FOR ALL
TO authenticated
USING (
    user_id = auth.uid() AND context = 'campanhas'
)
WITH CHECK (
    user_id = auth.uid() AND context = 'campanhas'
);
