-- RBAC: Expandir roles para cargos reais da agência

-- 1. Remove constraint antiga (admin | employee)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrar 'employee' existentes para 'outro' ANTES de adicionar nova constraint
UPDATE public.profiles SET role = 'outro' WHERE role = 'employee';

-- 3. Garantir que os 2 emails de admin tenham role='admin'
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('nc.marketingrj@gmail.com', 'hc.marketing.dgt@gmail.com')
);

-- 4. Nova constraint com todos os cargos (após dados já migrados)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'ceo', 'gerente', 'gestor_trafego', 'social_media', 'videomaker', 'outro'));
