-- Fase 7: CRM SDR Multi-Tenant Schema

-- 1. Atualizar profiles para adicionar client_id (Store ID)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 2. Atualizar a constraint de role na tabela profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'ceo', 'gerente', 'gestor_trafego', 'social_media', 'videomaker', 'agency_sdr', 'client_store', 'outro'));

-- 3. Criar tabela crm_leads
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  vehicle_interest text,
  negotiation_level text DEFAULT 'Frio', -- Frio, Morno, Quente
  status text DEFAULT 'Novo Lead', -- Novo Lead, Tentativa de Contato, Em Negociação, Visita Agendada, Vendido, Perdido
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em crm_leads
CREATE OR REPLACE FUNCTION public.set_crm_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_leads_updated_at();

-- 4. Criar tabela crm_activities
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL, -- Note, Call, WhatsApp, Email, StatusChange
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Atualiza o lead quando uma nova atividade é criada
CREATE OR REPLACE FUNCTION public.update_lead_timestamp_on_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.crm_leads SET updated_at = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_lead_timestamp_on_activity ON public.crm_activities;
CREATE TRIGGER trg_update_lead_timestamp_on_activity
  AFTER INSERT ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_timestamp_on_activity();


-- 5. Criar tabela crm_appointments
CREATE TABLE IF NOT EXISTS public.crm_appointments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_date timestamptz NOT NULL,
  status text DEFAULT 'Agendado', -- Agendado, Realizado, No-Show, Cancelado
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at em crm_appointments
CREATE OR REPLACE FUNCTION public.set_crm_appointments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_appointments_updated_at ON public.crm_appointments;
CREATE TRIGGER trg_crm_appointments_updated_at
  BEFORE UPDATE ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_appointments_updated_at();


-- 6. Habilitar RLS nas novas tabelas
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;

-- Helpers RLS
-- admin e agency_sdr podem tudo
-- client_store só pode SELECT no seu client_id

-- crm_leads policies
CREATE POLICY "crm_leads_full_access" ON public.crm_leads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  );

CREATE POLICY "crm_leads_client_read" ON public.crm_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'client_store' 
      AND profiles.client_id = crm_leads.client_id
    )
  );

-- crm_activities policies
CREATE POLICY "crm_activities_full_access" ON public.crm_activities
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  );

CREATE POLICY "crm_activities_client_read" ON public.crm_activities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads
      JOIN public.profiles ON profiles.client_id = crm_leads.client_id
      WHERE crm_leads.id = crm_activities.lead_id
      AND profiles.id = auth.uid()
      AND profiles.role = 'client_store'
    )
  );

-- crm_appointments policies
CREATE POLICY "crm_appointments_full_access" ON public.crm_appointments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'agency_sdr')
    )
  );

CREATE POLICY "crm_appointments_client_read" ON public.crm_appointments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads
      JOIN public.profiles ON profiles.client_id = crm_leads.client_id
      WHERE crm_leads.id = crm_appointments.lead_id
      AND profiles.id = auth.uid()
      AND profiles.role = 'client_store'
    )
  );
