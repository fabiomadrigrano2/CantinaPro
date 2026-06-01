-- ============================================================
-- Migração: tabela ciclos_cobranca (ciclos semanais de cobrança)
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

CREATE TYPE ciclo_status AS ENUM ('aberto', 'cobrado', 'pago');

CREATE TABLE ciclos_cobranca (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES alunos(id)   ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  semana_fim    DATE NOT NULL,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        ciclo_status  NOT NULL DEFAULT 'aberto',
  criado_em     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cantina_id, aluno_id, semana_inicio)
);

CREATE INDEX idx_ciclos_cantina ON ciclos_cobranca(cantina_id);
CREATE INDEX idx_ciclos_aluno   ON ciclos_cobranca(aluno_id);
CREATE INDEX idx_ciclos_status  ON ciclos_cobranca(status);

ALTER TABLE ciclos_cobranca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ciclos_cantina" ON ciclos_cobranca
  FOR ALL USING (cantina_id = minha_cantina_id());
