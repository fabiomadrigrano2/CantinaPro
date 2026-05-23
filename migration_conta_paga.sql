-- Adiciona campo conta_paga na tabela alunos
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS conta_paga BOOLEAN NOT NULL DEFAULT FALSE;
