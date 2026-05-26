-- Tabela de movimentações do caixa
CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cantina_id  UUID        NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  data        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo        TEXT        NOT NULL CHECK (tipo IN ('abertura', 'entrada', 'saida')),
  valor       NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  descricao   TEXT        NOT NULL DEFAULT '',
  saldo_apos  NUMERIC(10,2) NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE movimentacoes_caixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_access" ON movimentacoes_caixa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE movimentacoes_caixa TO service_role;
GRANT ALL ON TABLE movimentacoes_caixa TO authenticated;
