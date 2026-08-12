-- ============================================================
-- Migração: estoque alimentado por compras + Cardápio do Dia
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ============================================================

-- reposicoes foi criada direto no dashboard do Supabase (sem migration própria).
-- Garante a existência antes de alterá-la.
CREATE TABLE IF NOT EXISTS reposicoes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  produto_id  UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade  INTEGER NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Origem do abastecimento: reposição manual (tela Produtos) ou compra de fornecedor.
ALTER TABLE reposicoes ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE reposicoes ADD COLUMN IF NOT EXISTS compra_fornecedor_id UUID REFERENCES compras_fornecedores(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE reposicoes ADD CONSTRAINT reposicoes_origem_check
    CHECK (origem IN ('manual', 'compra_fornecedor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reposicoes_produto_id ON reposicoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_reposicoes_cantina_id ON reposicoes(cantina_id);

ALTER TABLE reposicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reposicoes por cantina" ON reposicoes;
CREATE POLICY "reposicoes por cantina" ON reposicoes
  FOR ALL USING (cantina_id = minha_cantina_id());

-- Sem isso, o Postgres nega acesso à tabela antes mesmo do RLS ser avaliado
-- (GRANT e RLS são camadas independentes — ver migration_fornecedores.sql).
GRANT ALL ON TABLE reposicoes TO service_role;
GRANT ALL ON TABLE reposicoes TO authenticated;

-- ── Itens estruturados de uma compra de fornecedor ─────────────────────────

CREATE TABLE compra_itens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  compra_id   UUID NOT NULL REFERENCES compras_fornecedores(id) ON DELETE CASCADE,
  produto_id  UUID NOT NULL REFERENCES produtos(id),
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compra_itens_compra_id  ON compra_itens(compra_id);
CREATE INDEX idx_compra_itens_produto_id ON compra_itens(produto_id);
CREATE INDEX idx_compra_itens_cantina_id ON compra_itens(cantina_id);

ALTER TABLE compra_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compra_itens por cantina" ON compra_itens
  FOR ALL USING (cantina_id = minha_cantina_id());

GRANT ALL ON TABLE compra_itens TO service_role;
GRANT ALL ON TABLE compra_itens TO authenticated;

-- ── Cardápio do Dia ─────────────────────────────────────────────────────────

CREATE TABLE cardapio_diario (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id             UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  produto_id             UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  data                   DATE NOT NULL,
  quantidade_disponivel  INTEGER NOT NULL CHECK (quantidade_disponivel >= 0),
  criado_em              TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cantina_id, produto_id, data)
);

CREATE INDEX idx_cardapio_diario_cantina_data ON cardapio_diario(cantina_id, data);

ALTER TABLE cardapio_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cardapio_diario por cantina" ON cardapio_diario
  FOR ALL USING (cantina_id = minha_cantina_id());

GRANT ALL ON TABLE cardapio_diario TO service_role;
GRANT ALL ON TABLE cardapio_diario TO authenticated;
