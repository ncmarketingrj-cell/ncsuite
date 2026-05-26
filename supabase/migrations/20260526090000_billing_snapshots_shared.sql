-- Ajusta RLS de billing_snapshots para workspace compartilhado:
-- todos os usuários autenticados leem todos os snapshots,
-- mas apenas o próprio usuário pode inserir/atualizar/deletar os seus.

DROP POLICY IF EXISTS "billing_snapshots_own" ON billing_snapshots;

-- Leitura: qualquer autenticado (workspace compartilhado)
CREATE POLICY "billing_snapshots_read_all"
  ON billing_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: apenas o dono do snapshot
CREATE POLICY "billing_snapshots_write_own"
  ON billing_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "billing_snapshots_delete_own"
  ON billing_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
