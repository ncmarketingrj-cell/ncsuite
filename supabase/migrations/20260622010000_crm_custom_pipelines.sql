-- 1. Create crm_pipelines table
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_crm_pipelines_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_crm_pipelines_updated_at
BEFORE UPDATE ON public.crm_pipelines
FOR EACH ROW EXECUTE FUNCTION public.set_crm_pipelines_updated_at();

-- 2. Create crm_pipeline_stages table
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  color text DEFAULT 'neutral', -- neutral, blue, amber, success, red, purple
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_crm_pipeline_stages_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_crm_pipeline_stages_updated_at
BEFORE UPDATE ON public.crm_pipeline_stages
FOR EACH ROW EXECUTE FUNCTION public.set_crm_pipeline_stages_updated_at();

-- 3. Modify crm_leads to support pipelines, stages and assignments
ALTER TABLE public.crm_leads 
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Enable RLS and Create Policies
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Pipelines RLS
CREATE POLICY "Admin and SDR can manage all pipelines" ON public.crm_pipelines
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'agency_sdr')
  )
);

CREATE POLICY "Clients can view their pipelines" ON public.crm_pipelines
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'client_store' AND profiles.client_id = crm_pipelines.client_id
  )
);

-- Stages RLS
CREATE POLICY "Admin and SDR can manage all stages" ON public.crm_pipeline_stages
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'agency_sdr')
  )
);

CREATE POLICY "Clients can view their stages" ON public.crm_pipeline_stages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.crm_pipelines
    JOIN public.profiles ON profiles.client_id = crm_pipelines.client_id
    WHERE crm_pipelines.id = crm_pipeline_stages.pipeline_id
    AND profiles.id = auth.uid() AND profiles.role = 'client_store'
  )
);

-- 5. Data Migration: Migrate existing leads to a default pipeline
DO $$
DECLARE
  rec record;
  p_id uuid;
  s_novo uuid;
  s_tentativa uuid;
  s_negociacao uuid;
  s_visita uuid;
  s_vendido uuid;
  s_perdido uuid;
BEGIN
  FOR rec IN SELECT DISTINCT client_id FROM public.crm_leads WHERE client_id IS NOT NULL LOOP
    -- Create default pipeline for this client
    INSERT INTO public.crm_pipelines (client_id, name) 
    VALUES (rec.client_id, 'Funil Padrão') 
    RETURNING id INTO p_id;

    -- Create default stages
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Novo Lead', 0, 'neutral') RETURNING id INTO s_novo;
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Tentativa de Contato', 1, 'amber') RETURNING id INTO s_tentativa;
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Em Negociação', 2, 'blue') RETURNING id INTO s_negociacao;
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Visita Agendada', 3, 'purple') RETURNING id INTO s_visita;
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Vendido', 4, 'success') RETURNING id INTO s_vendido;
    INSERT INTO public.crm_pipeline_stages (pipeline_id, name, stage_order, color) VALUES (p_id, 'Perdido', 5, 'red') RETURNING id INTO s_perdido;

    -- Update leads for this client based on their status
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_novo WHERE client_id = rec.client_id AND status = 'Novo Lead';
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_tentativa WHERE client_id = rec.client_id AND status = 'Tentativa de Contato';
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_negociacao WHERE client_id = rec.client_id AND status = 'Em Negociação';
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_visita WHERE client_id = rec.client_id AND status = 'Visita Agendada';
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_vendido WHERE client_id = rec.client_id AND status = 'Vendido';
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_perdido WHERE client_id = rec.client_id AND status = 'Perdido';
    
    -- For any edge cases
    UPDATE public.crm_leads SET pipeline_id = p_id, stage_id = s_novo WHERE client_id = rec.client_id AND stage_id IS NULL;
  END LOOP;
END;
$$;
