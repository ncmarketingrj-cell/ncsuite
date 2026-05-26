-- Tabela de cache para dados de cobrança das contas Meta Ads
CREATE TABLE IF NOT EXISTS billing_snapshots (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users ON DELETE CASCADE,
  ad_account_id   text NOT NULL,
  ad_account_name text,
  fetched_at      timestamptz DEFAULT now(),
  -- campos da conta
  balance         numeric,        -- saldo pré-pago (centavos, apenas contas pré-pagas)
  amount_spent    numeric,        -- total gasto acumulado (centavos)
  spend_cap       numeric,        -- limite de gasto (centavos)
  currency        text,
  funding_source  jsonb,          -- { type, display_string, last4, ... }
  bill_immature   numeric,        -- valor não faturado do ciclo atual
  -- histórico de transações (array bruto da API)
  transactions    jsonb DEFAULT '[]'::jsonb
);

-- índice para consulta rápida por conta + data
CREATE INDEX IF NOT EXISTS billing_snapshots_account_fetched
  ON billing_snapshots (ad_account_id, fetched_at DESC);

-- RLS: cada usuário vê apenas seus próprios dados
ALTER TABLE billing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_snapshots_own" ON billing_snapshots
  FOR ALL USING (auth.uid() = user_id);
