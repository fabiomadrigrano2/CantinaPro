-- ============================================================
-- Migração: adicionar forma_pagamento em ciclos_cobranca
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

ALTER TABLE ciclos_cobranca
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
