-- ============================================================
-- Migração: colunas do portal e fluxo simplificado de alunos
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

-- Campos do responsável diretamente na tabela alunos
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS email_responsavel     TEXT,
  ADD COLUMN IF NOT EXISTS telefone_responsavel  TEXT,
  ADD COLUMN IF NOT EXISTS turma                 TEXT,
  ADD COLUMN IF NOT EXISTS limite_diario         NUMERIC(10,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS ciclo_cobranca        TEXT DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS dia_cobranca          INTEGER,
  ADD COLUMN IF NOT EXISTS saldo                 NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tipo_conta            TEXT DEFAULT 'credito';

-- Índice para busca rápida pelo e-mail do responsável
CREATE INDEX IF NOT EXISTS idx_alunos_email_responsavel
  ON alunos (email_responsavel);

-- conta_paga (pode já existir via migration_conta_paga.sql)
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS conta_paga BOOLEAN NOT NULL DEFAULT FALSE;
