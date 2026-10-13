-- ============================================================
-- Migração: alerta de saldo por aluno + histórico de pagamentos
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ANTES de publicar o código que usa essas colunas.
-- ============================================================

-- 1) Limite de alerta de saldo personalizado por aluno
--    (NULL = sem alerta configurado)
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS limite_alerta_saldo NUMERIC(10,2);

-- 2) Tabela pagamentos já existe (schema original), mas não tinha as
--    colunas que o "Registrar Pgto" grava — por isso os inserts falhavam
--    silenciosamente e a tabela está vazia.
ALTER TABLE pagamentos
  ADD COLUMN IF NOT EXISTS aluno_id        UUID REFERENCES alunos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS tipo            TEXT;

-- Pagamentos registrados pela tela de admin nem sempre têm uma linha em contas
ALTER TABLE pagamentos
  ALTER COLUMN conta_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno
  ON pagamentos (aluno_id, criado_em DESC);

-- Atualiza o cache de schema do PostgREST para enxergar as colunas novas
NOTIFY pgrst, 'reload schema';
