-- ============================================================
-- Migração: notificação de consumo via WhatsApp (opt-in por aluno)
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ANTES de publicar o código que usa essa coluna.
-- ============================================================

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS notificar_consumo BOOLEAN DEFAULT FALSE;

-- Atualiza o cache de schema do PostgREST para enxergar a coluna nova
NOTIFY pgrst, 'reload schema';
