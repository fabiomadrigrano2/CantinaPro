-- ============================================================
-- Migração: módulo de Fornecedores
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

CREATE TYPE frequencia_entrega_tipo AS ENUM ('diaria', 'semanal', 'quinzenal', 'mensal');
CREATE TYPE compra_status_pagamento AS ENUM ('pago', 'a_pagar');

CREATE TABLE fornecedores (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  telefone            TEXT,
  produtos_fornecidos TEXT,
  frequencia_entrega  frequencia_entrega_tipo NOT NULL DEFAULT 'semanal',
  observacoes         TEXT,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compras_fornecedores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id        UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  fornecedor_id     UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  data_entrega      DATE NOT NULL,
  descricao         TEXT NOT NULL,
  valor             NUMERIC(10,2) NOT NULL,
  status_pagamento  compra_status_pagamento NOT NULL DEFAULT 'a_pagar',
  data_vencimento   DATE,
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compras_fornecedores_fornecedor_id ON compras_fornecedores(fornecedor_id);
CREATE INDEX idx_compras_fornecedores_cantina_id    ON compras_fornecedores(cantina_id);

ALTER TABLE fornecedores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_fornecedores  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fornecedores por cantina" ON fornecedores
  FOR ALL USING (cantina_id = minha_cantina_id());

CREATE POLICY "compras_fornecedores por cantina" ON compras_fornecedores
  FOR ALL USING (cantina_id = minha_cantina_id());

-- Sem isso, o Postgres nega acesso à tabela antes mesmo do RLS ser avaliado
-- (GRANT e RLS são camadas independentes — ver migration_fechamentos_diarios.sql).
GRANT ALL ON TABLE fornecedores         TO service_role;
GRANT ALL ON TABLE fornecedores         TO authenticated;
GRANT ALL ON TABLE compras_fornecedores TO service_role;
GRANT ALL ON TABLE compras_fornecedores TO authenticated;
