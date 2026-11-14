-- 20261114150000_victoria_contract_2026_11_4.sql
-- Contrato Canônico Victoria AI v2026.11.4: Schema parity, RAG active filtering & legacy isolation

-- 1. Alinhar colunas reais de public.victoria_knowledge com a edge function victoria-agent
ALTER TABLE public.victoria_knowledge
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.victoria_knowledge
SET
  is_active = CASE
    WHEN approval_status = 'APPROVED' AND evidence_level NOT IN ('UNVERIFIED', 'OPINION') THEN true
    ELSE false
  END,
  priority = CASE
    WHEN evidence_level = 'OFFICIAL_DOC' THEN 200
    WHEN evidence_level = 'INTERNAL_RULE' THEN 150
    ELSE 50
  END,
  version = CASE
    WHEN approval_status = 'APPROVED' THEN '2026.11.4'
    ELSE version
  END,
  updated_at = now();

CREATE INDEX IF NOT EXISTS victoria_knowledge_active_approved_idx
  ON public.victoria_knowledge(is_active, approval_status, priority DESC, created_at DESC);

-- 2. Marcar histórico legado (< 2026.11.4) em public.victoria_messages e public.victoria_conversations
ALTER TABLE public.victoria_conversations
  ADD COLUMN IF NOT EXISTS legacy_status text DEFAULT NULL;

ALTER TABLE public.victoria_messages
  ADD COLUMN IF NOT EXISTS contract_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prompt_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS legacy_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rag_citations jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.victoria_conversations
SET legacy_status = 'diagnóstico legado'
WHERE (contract_version IS NULL OR contract_version <> '2026.11.4')
  AND legacy_status IS NULL;

UPDATE public.victoria_messages
SET legacy_status = 'diagnóstico legado'
WHERE (contract_version IS NULL OR contract_version <> '2026.11.4')
  AND legacy_status IS NULL;

-- 3. Alinhar colunas completas de auditoria em public.victoria_analysis_logs
ALTER TABLE public.victoria_analysis_logs
  ADD COLUMN IF NOT EXISTS metric_category text,
  ADD COLUMN IF NOT EXISTS official_result_label text,
  ADD COLUMN IF NOT EXISTS latency_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_fallback boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aborted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS context_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retrieved_doc_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'VALID',
  ADD COLUMN IF NOT EXISTS action_mode text DEFAULT 'READ_ONLY_ANALYSIS';

-- 4. Atualizar RPC match_victoria_knowledge para exigir is_active = true e approval_status = 'APPROVED'
DROP FUNCTION IF EXISTS public.match_victoria_knowledge(vector, double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.match_victoria_knowledge (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  similarity float,
  author text,
  source text,
  url text,
  published_at timestamptz,
  evidence_level text,
  approval_status text,
  version text,
  objective text,
  region text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vk.id,
    vk.category,
    vk.title,
    vk.content,
    1 - (vk.embedding <=> query_embedding) AS similarity,
    vk.author,
    vk.source,
    vk.url,
    vk.published_at,
    vk.evidence_level,
    vk.approval_status,
    vk.version,
    vk.objective,
    vk.region
  FROM public.victoria_knowledge vk
  WHERE vk.embedding IS NOT NULL
    AND vk.is_active = true
    AND vk.approval_status = 'APPROVED'
    AND vk.evidence_level NOT IN ('OPINION', 'UNVERIFIED')
    AND (vk.valid_until IS NULL OR vk.valid_until > now())
    AND (p_user_id IS NULL OR vk.user_id = p_user_id OR vk.evidence_level IN ('OFFICIAL_DOC', 'INTERNAL_RULE'))
    AND 1 - (vk.embedding <=> query_embedding) > match_threshold
  ORDER BY vk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
