-- Tabela de fechamentos diários
CREATE TABLE IF NOT EXISTS fechamentos_diarios (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cantina_id    UUID        NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  data          DATE        NOT NULL,
  valor_dinheiro NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_cartao   NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_pix      NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_credito  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cantina_id, data)
);

ALTER TABLE fechamentos_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_access" ON fechamentos_diarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE fechamentos_diarios TO service_role;
GRANT ALL ON TABLE fechamentos_diarios TO authenticated;
