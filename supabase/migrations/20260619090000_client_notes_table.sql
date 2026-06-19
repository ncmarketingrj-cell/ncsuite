-- Migração para suporte a Histórico de Notas dos Clientes
-- Criado em: 2026-06-19

CREATE TABLE IF NOT EXISTS client_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'Geral',
    tags TEXT[] DEFAULT '{}'::TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS simples para usuários autenticados
CREATE POLICY "Allow all actions for authenticated users on client_notes" 
ON client_notes FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
