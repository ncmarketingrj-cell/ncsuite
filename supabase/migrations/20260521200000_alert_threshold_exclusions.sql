-- Adiciona suporte a exclusão de contas específicas em regras globais
ALTER TABLE alert_thresholds
  ADD COLUMN IF NOT EXISTS excluded_account_ids text[] DEFAULT '{}';
