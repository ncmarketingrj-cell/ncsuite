CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  pdf_layout TEXT DEFAULT 'classic',
  is_system BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Permite leitura de todos os templates para usuários logados
CREATE POLICY "Enable read access for all authenticated users" 
ON public.report_templates FOR SELECT 
TO authenticated USING (true);

-- Permite inserção apenas para o próprio usuário
CREATE POLICY "Enable insert for authenticated users" 
ON public.report_templates FOR INSERT 
TO authenticated WITH CHECK (auth.uid() = user_id);

-- Permite update apenas nos próprios templates
CREATE POLICY "Enable update for users based on user_id" 
ON public.report_templates FOR UPDATE 
TO authenticated USING (auth.uid() = user_id);

-- Permite delete apenas nos próprios templates
CREATE POLICY "Enable delete for users based on user_id" 
ON public.report_templates FOR DELETE 
TO authenticated USING (auth.uid() = user_id);

-- Notificamos o PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
