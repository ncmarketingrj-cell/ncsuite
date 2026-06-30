-- 1. Criar tabela de relacionamento entre funis e SDRs
CREATE TABLE IF NOT EXISTS public.crm_pipeline_sdrs (
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  sdr_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (pipeline_id, sdr_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.crm_pipeline_sdrs ENABLE ROW LEVEL SECURITY;

-- 3. Criar políticas
DROP POLICY IF EXISTS "SDRs and admins can manage pipeline SDRs" ON public.crm_pipeline_sdrs;
CREATE POLICY "SDRs and admins can manage pipeline SDRs" 
ON public.crm_pipeline_sdrs
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Notificar recarga de schema
NOTIFY pgrst, 'reload schema';
