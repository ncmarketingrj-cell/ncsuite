-- 20260618080000_victoria_hub_schema.sql
-- Migration para o Hub Victoria AI Enterprise (Conversas, Mensagens e RAG Vetorial)

-- 1. Ativar a extensão vector se não estiver ativa
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela de Conversas (Threads)
CREATE TABLE IF NOT EXISTS public.victoria_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova Conversa',
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS public.victoria_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.victoria_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Pode armazenar imagens (base64 ou link), ações propostas/executadas, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Conhecimento Vetorial (MemoryOS / LPM)
CREATE TABLE IF NOT EXISTS public.victoria_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('inventory', 'brand_voice', 'manual', 'strategy', 'custom')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768), -- Embedding de 768 dimensões (compatível com Gemini)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE public.victoria_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.victoria_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.victoria_knowledge ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de RLS
DO $$
BEGIN
  -- victoria_conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'victoria_conversations' AND policyname = 'Users own conversations'
  ) THEN
    CREATE POLICY "Users own conversations" ON public.victoria_conversations
      FOR ALL USING (auth.uid() = user_id);
  END IF;

  -- victoria_messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'victoria_messages' AND policyname = 'Users see own messages'
  ) THEN
    CREATE POLICY "Users see own messages" ON public.victoria_messages
      FOR ALL USING (
        conversation_id IN (
          SELECT id FROM public.victoria_conversations WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- victoria_knowledge
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'victoria_knowledge' AND policyname = 'Users own knowledge'
  ) THEN
    CREATE POLICY "Users own knowledge" ON public.victoria_knowledge
      FOR ALL USING (auth.uid() = user_id);
  END If;
END
$$;

-- 7. Criar índices para otimização de busca
CREATE INDEX IF NOT EXISTS victoria_conversations_user_idx ON public.victoria_conversations(user_id);
CREATE INDEX IF NOT EXISTS victoria_messages_conversation_idx ON public.victoria_messages(conversation_id);
CREATE INDEX IF NOT EXISTS victoria_knowledge_user_idx ON public.victoria_knowledge(user_id);
CREATE INDEX IF NOT EXISTS victoria_knowledge_embedding_idx ON public.victoria_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
