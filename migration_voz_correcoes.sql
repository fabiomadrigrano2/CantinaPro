-- ============================================================
-- Migração: correções fonéticas do comando de voz
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ANTES de publicar o código que usa essa tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS voz_correcoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  falado      TEXT NOT NULL,
  corrigido   TEXT NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Uma correção por expressão falada (sem diferenciar maiúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_voz_correcoes_falado
  ON voz_correcoes (cantina_id, lower(falado));

-- Tabelas novas não recebem permissão automática neste projeto
-- (GRANT e RLS são camadas independentes — ver migration_fechamentos_diarios.sql).
GRANT ALL ON TABLE voz_correcoes TO service_role;
GRANT ALL ON TABLE voz_correcoes TO authenticated;

ALTER TABLE voz_correcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voz_correcoes por cantina" ON voz_correcoes;
CREATE POLICY "voz_correcoes por cantina" ON voz_correcoes
  FOR ALL USING (cantina_id = minha_cantina_id());

-- Correções pré-cadastradas
INSERT INTO voz_correcoes (cantina_id, falado, corrigido) VALUES
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'ememe',                 'M&M'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'm m',                   'M&M'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'eme eme',               'M&M'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'croassã',               'Croissant'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'croasã',                'Croissant'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'cruassã',               'Croissant'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'deep loco',             'Deep Loco'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'dip loco',              'Deep Loco'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'esfiha quatro queijos', 'Esfiha 4 queijos'),
  ('c7301d8b-890b-4775-986e-bb88979326f3', 'esfirra 4 queijos',     'Esfiha 4 queijos')
ON CONFLICT DO NOTHING;

-- Atualiza o cache de schema do PostgREST para enxergar a tabela nova
NOTIFY pgrst, 'reload schema';
