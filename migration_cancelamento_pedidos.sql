-- ============================================================
-- Migração: cancelamento de vendas em pedidos
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cancelado_por      UUID REFERENCES perfis(id),
  ADD COLUMN IF NOT EXISTS cancelado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS cancelado_em       TIMESTAMPTZ;
