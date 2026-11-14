-- 20261114120000_victoria_rag_curation_and_contract_governance.sql
-- Governança RAG, Curadoria de Evidências e Auditoria de Contexto Canônico da Victoria AI (v2026.11.3)

-- 1. Adicionar colunas canônicas de curadoria e proveniência em public.victoria_knowledge
ALTER TABLE public.victoria_knowledge
  ADD COLUMN IF NOT EXISTS author text DEFAULT 'NC Performance Strategy Team',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'Base Interna NC Suite',
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'BR-RJ',
  ADD COLUMN IF NOT EXISTS objective text DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS evidence_level text DEFAULT 'INTERNAL_RULE'
    CHECK (evidence_level IN ('OFFICIAL_DOC', 'INTERNAL_RULE', 'CASE_STUDY', 'MARKET_NEWS', 'OPINION', 'UNVERIFIED')),
  ADD COLUMN IF NOT EXISTS version text DEFAULT '2026.11.3',
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'PENDING_REVIEW'
    CHECK (approval_status IN ('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS semantic_hash text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS victoria_knowledge_approval_status_idx
  ON public.victoria_knowledge(approval_status, evidence_level);

CREATE INDEX IF NOT EXISTS victoria_knowledge_semantic_hash_idx
  ON public.victoria_knowledge(semantic_hash);

-- 2. Adicionar suporte a contexto imutável em public.victoria_messages e public.victoria_conversations
ALTER TABLE public.victoria_conversations
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS entity_level text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS analysis_context_hash text,
  ADD COLUMN IF NOT EXISTS contract_version text DEFAULT '2026.11.3';

ALTER TABLE public.victoria_messages
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS analysis_context_hash text,
  ADD COLUMN IF NOT EXISTS context_snapshot jsonb;

-- 3. Criar tabela de auditoria canônica de análises e propostas da Victoria AI
CREATE TABLE IF NOT EXISTS public.victoria_analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  analysis_context_hash text NOT NULL,
  user_id uuid,
  conversation_id uuid,
  source_surface text NOT NULL,
  route text,
  ad_account_id text,
  entity_level text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  objective text,
  result_indicator text,
  date_from text,
  date_to text,
  confidence_level text CHECK (confidence_level IN ('baixa', 'media', 'alta')),
  contract_version text NOT NULL DEFAULT '2026.11.3',
  prompt_version text NOT NULL DEFAULT '2026.11.3',
  model_version text NOT NULL DEFAULT 'gemini-2.5-flash',
  context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  rag_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_fields text[] DEFAULT '{}',
  limitations text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS victoria_analysis_logs_entity_idx
  ON public.victoria_analysis_logs(ad_account_id, entity_level, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS victoria_analysis_logs_request_idx
  ON public.victoria_analysis_logs(request_id);

ALTER TABLE public.victoria_analysis_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "victoria_analysis_logs all auth" ON public.victoria_analysis_logs;
CREATE POLICY "victoria_analysis_logs all auth"
  ON public.victoria_analysis_logs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Atualizar RPC match_victoria_knowledge para retornar APENAS documentos APPROVED e vigentes
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
SET search_path = public
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
    AND vk.approval_status = 'APPROVED'
    AND vk.evidence_level NOT IN ('OPINION', 'UNVERIFIED')
    AND (vk.valid_until IS NULL OR vk.valid_until > now())
    AND 1 - (vk.embedding <=> query_embedding) > match_threshold
  ORDER BY vk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Curadoria e higienização determinística dos documentos existentes em produção
-- 5a. Rejeitar documentos de RSS/Radar com alegações universais não verificáveis ("54% mais conversas", "CPL pela metade") ou HTML bruto/URLs truncadas
UPDATE public.victoria_knowledge
SET
  approval_status = 'REJECTED',
  evidence_level = 'UNVERIFIED',
  source = 'Coleta RSS Externa Não Auditada',
  rejection_reason = 'Contém estatísticas universais sem fonte primária auditável (54% mais conversas / redução de CPL pela metade), URLs de homepage genérica ou HTML bruto/truncado de RSS.',
  updated_at = now()
WHERE id IN (
  '7cf00abb-13e1-4808-afe0-78fc54376b44',
  'f19504f2-17be-4caa-a390-460651cd1e45',
  'dd2214bc-91c3-4f5e-b51f-0fbf4005b656'
)
OR title ILIKE '%[RADAR MERCADO%'
OR content ILIKE '%54% mais conversas%'
OR content ILIKE '%CPL efetivo pela metade%'
OR content ILIKE '%&lt;a href=%';

-- 5b. Higienizar documento de Seminovos RJ removendo promessa de crédito "sem consulta SPC/Serasa"
UPDATE public.victoria_knowledge
SET
  content = 'PANORAMA RJ: 2º maior mercado de seminovos do Brasil. Demanda concentrada em Zona Sul, Barra, Niterói, Nova Iguaçu, Duque de Caxias. Faixa de referência de ticket: R$ 45-85k (popular) | R$ 120-280k (premium).' || E'\n\n' ||
            'MODELOS COM ALTA PROCURA NO RJ:' || E'\n' ||
            '1. Toyota Corolla (XEi, Altis) 2. Jeep Renegade/Compass 3. Honda HR-V/Civic' || E'\n' ||
            '4. VW T-Cross/Virtus 5. Hyundai Creta 6. Chevrolet Tracker/Onix Plus 7. BMW Série 3' || E'\n\n' ||
            'DIFERENCIAIS OPERACIONAIS NOS ANÚNCIOS: Histórico de revisão documentado, laudo cautelar aprovado, garantia clara em contrato, avaliação de usado na troca, condições transparentes de financiamento (sujeito a análise de crédito).' || E'\n\n' ||
            'DIRETRIZ DE CONFORMIDADE: Nunca prometer aprovação garantida de crédito sem análise formal da instituição financeira.',
  author = 'NC Performance Compliance & Strategy',
  source = 'Manual Operacional Interno NC Suite',
  region = 'BR-RJ',
  objective = 'MESSAGES',
  evidence_level = 'INTERNAL_RULE',
  approval_status = 'APPROVED',
  version = '2026.11.3',
  rejection_reason = NULL,
  semantic_hash = md5('seminovos_rj_guia_estrategico_2026_v3'),
  updated_at = now()
WHERE id = '099f3145-931a-441c-8648-ed39a57a3efb'
   OR title ILIKE '%Mercado de Seminovos RJ%';

-- 5c. Higienizar documento de SLA de Atendimento removendo percentuais universais sem prova ("80% conversão")
UPDATE public.victoria_knowledge
SET
  content = 'SLA OPERACIONAL INTERNO NC PERFORMANCE:' || E'\n' ||
            '- WhatsApp: meta operacional de primeiro contato em até 5 minutos no horário comercial' || E'\n' ||
            '- Formulário de site / Lead Ads: meta operacional de contato em até 15 minutos' || E'\n\n' ||
            'PRINCÍPIO OPERACIONAL (HIPÓTESE DE ATENDIMENTO):' || E'\n' ||
            '- Quanto menor o tempo de resposta após a conversa iniciada ou envio de cadastro, maior tende a ser a taxa de continuidade do atendimento.' || E'\n' ||
            '- A Victoria não observa o CRM nem o tempo real de resposta dos vendedores a menos que esses eventos estejam integrados no contexto.' || E'\n\n' ||
            'ROTEIRO SUGERIDO DE QUALIFICAÇÃO COMERCIAL (WHATSAPP):' || E'\n' ||
            '1. Identificar veículo ou faixa de interesse (novo ou seminovo)' || E'\n' ||
            '2. Verificar se há veículo usado para avaliação na troca' || E'\n' ||
            '3. Entender preferência de pagamento (à vista ou simulação de financiamento sujeita a crédito)' || E'\n' ||
            '4. Convidar para visita presencial / test drive na loja',
  author = 'NC Performance Operations',
  source = 'Manual de SLA Comercial NC Suite',
  region = 'BR-RJ',
  objective = 'MESSAGES',
  evidence_level = 'INTERNAL_RULE',
  approval_status = 'APPROVED',
  version = '2026.11.3',
  rejection_reason = NULL,
  semantic_hash = md5('sla_atendimento_lead_nc_2026_v3'),
  updated_at = now()
WHERE id = '61bd971a-d922-490a-a5cb-1e0befcfc52d'
   OR title ILIKE '%SLA de Atendimento ao Lead%';

-- 5d. Aprovar e catalogar os demais documentos técnicos e manuais internos auditados
UPDATE public.victoria_knowledge
SET
  author = CASE
    WHEN title ILIKE '%[PARECER TÉCNICO META ADS 2026%' THEN 'Engenharia de Tráfego NC Performance'
    ELSE 'NC Performance Strategy Team'
  END,
  source = CASE
    WHEN title ILIKE '%[PARECER TÉCNICO META ADS 2026%' THEN 'Especificação Técnica Interna Meta Ads 2026'
    ELSE 'Playbook Operacional NC Performance'
  END,
  region = 'BR-RJ',
  objective = CASE
    WHEN category = 'inventory' THEN 'MESSAGES'
    ELSE 'ALL'
  END,
  evidence_level = CASE
    WHEN title ILIKE '%[PARECER TÉCNICO META ADS 2026%' THEN 'OFFICIAL_DOC'
    ELSE 'INTERNAL_RULE'
  END,
  approval_status = 'APPROVED',
  version = '2026.11.3',
  ingested_at = COALESCE(ingested_at, created_at, now()),
  published_at = COALESCE(published_at, created_at, now()),
  semantic_hash = md5(COALESCE(title, '') || ':' || LEFT(COALESCE(content, ''), 500)),
  updated_at = now()
WHERE approval_status <> 'REJECTED'
  AND id NOT IN (
    '7cf00abb-13e1-4808-afe0-78fc54376b44',
    'f19504f2-17be-4caa-a390-460651cd1e45',
    'dd2214bc-91c3-4f5e-b51f-0fbf4005b656',
    '099f3145-931a-441c-8648-ed39a57a3efb',
    '61bd971a-d922-490a-a5cb-1e0befcfc52d'
  );
