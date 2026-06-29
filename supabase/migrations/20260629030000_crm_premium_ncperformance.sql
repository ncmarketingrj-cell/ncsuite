-- Migração: Adicionar campos de CRM Premium e Tabela de Tarefas
-- Data: 29/06/2026

-- 1. Adicionar colunas adicionais em crm_leads
ALTER TABLE public.crm_leads 
  ADD COLUMN IF NOT EXISTS lead_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'Cadastro Manual';

-- 2. Adicionar campaign_id na tabela crm_pipelines
ALTER TABLE public.crm_pipelines 
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- 3. Criar a tabela crm_tasks
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  assigned_to   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'Nota'
                  CHECK (type IN ('WhatsApp', 'Chamada', 'Email', 'Visita', 'Nota')),
  status        TEXT NOT NULL DEFAULT 'Pendente'
                  CHECK (status IN ('Pendente', 'Concluida', 'Cancelada')),
  due_date      TIMESTAMPTZ NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Trigger para updated_at em crm_tasks
CREATE OR REPLACE FUNCTION public.set_crm_tasks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_tasks_updated_at();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead_id      ON public.crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to  ON public.crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status       ON public.crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date     ON public.crm_tasks(due_date);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "crm_tasks_authenticated" ON public.crm_tasks;
CREATE POLICY "crm_tasks_authenticated"
  ON public.crm_tasks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Notificar recarga de schema
NOTIFY pgrst, 'reload schema';
