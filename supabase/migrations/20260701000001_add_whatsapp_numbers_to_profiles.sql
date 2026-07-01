-- Migration to add whatsapp_numbers array to profiles
-- Date: 2026-07-01

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_numbers text[] DEFAULT '{}'::text[];

-- Migrate any existing single whatsapp_phone from meta_ads_configs to the admin user (optional, but good for UX)
-- If we find the master user, we can append the global phone there.
DO $$
DECLARE
  master_id uuid;
  global_phone text;
BEGIN
  -- Get the global phone
  SELECT whatsapp_phone INTO global_phone FROM public.meta_ads_configs LIMIT 1;
  
  -- If there's a global phone, try to find the master admin and add it
  IF global_phone IS NOT NULL AND global_phone <> '' THEN
    SELECT id INTO master_id FROM public.profiles WHERE email = 'nc.marketingrj@gmail.com' LIMIT 1;
    IF master_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET whatsapp_numbers = array_append(whatsapp_numbers, global_phone)
      WHERE id = master_id AND NOT (whatsapp_numbers @> ARRAY[global_phone]);
    END IF;
  END IF;
END $$;
