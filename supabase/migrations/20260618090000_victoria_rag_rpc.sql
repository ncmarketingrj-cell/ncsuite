-- 20260618090000_victoria_rag_rpc.sql
-- Função SQL RPC para busca por similaridade de cosseno na tabela victoria_knowledge

CREATE OR REPLACE FUNCTION public.match_victoria_knowledge (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    victoria_knowledge.id,
    victoria_knowledge.category,
    victoria_knowledge.title,
    victoria_knowledge.content,
    1 - (victoria_knowledge.embedding <=> query_embedding) AS similarity
  FROM public.victoria_knowledge
  WHERE victoria_knowledge.user_id = p_user_id
    AND 1 - (victoria_knowledge.embedding <=> query_embedding) > match_threshold
  ORDER BY victoria_knowledge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
