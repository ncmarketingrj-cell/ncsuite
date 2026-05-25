-- Corrige handle_new_user: role default 'employee' violava constraint apos migracao rbac
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'outro');
  IF v_role NOT IN ('admin','ceo','gerente','gestor_trafego','social_media','videomaker','outro') THEN
    v_role := 'outro';
  END IF;

  INSERT INTO public.profiles (id, full_name, position, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'position', ''),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
