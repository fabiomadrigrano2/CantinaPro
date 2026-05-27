-- Adiciona coluna despesas na tabela fechamentos_diarios
ALTER TABLE fechamentos_diarios
  ADD COLUMN IF NOT EXISTS despesas NUMERIC(10,2) NOT NULL DEFAULT 0;
