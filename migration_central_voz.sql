-- ============================================================
-- Migração: Central de Voz (Dashboard) — log de ações + desfazer
-- Execute no SQL Editor do Supabase (Database > SQL Editor)
-- ANTES de publicar o código que usa essa tabela.
-- ============================================================

-- 1) Pagamentos desfeitos ficam como "estornado" (não são apagados).
--    O trigger trg_creditar_pagamento só age quando o status vira
--    'confirmado', então marcar como estornado não mexe em saldo.
ALTER TYPE pagamento_status ADD VALUE IF NOT EXISTS 'estornado';

-- 2) Log das ações executadas pela Central de Voz, com o estado anterior
--    necessário para desfazer.
CREATE TABLE IF NOT EXISTS voz_acoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id            UUID NOT NULL REFERENCES alunos(id)   ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('abater', 'credito', 'quitar')),
  valor               NUMERIC(10,2) NOT NULL,
  forma_pagamento     TEXT,
  texto_falado        TEXT,
  saldo_antes         NUMERIC(10,2) NOT NULL,
  saldo_depois        NUMERIC(10,2) NOT NULL,
  conta_paga_antes    BOOLEAN,
  conta_saldo_antes   NUMERIC(10,2),
  conta_saldo_depois  NUMERIC(10,2),
  -- Ciclos alterados pela ação, como estavam antes:
  -- [{ semana_inicio, existia, status, forma_pagamento, total }]
  ciclos_antes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  pagamento_id        UUID REFERENCES pagamentos(id) ON DELETE SET NULL,
  usuario_id          UUID,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desfeito_em         TIMESTAMPTZ,
  desfeito_por        UUID
);

CREATE INDEX IF NOT EXISTS idx_voz_acoes_recentes
  ON voz_acoes (cantina_id, criado_em DESC);

-- Tabelas novas não recebem permissão automática neste projeto
GRANT ALL ON TABLE voz_acoes TO service_role;
GRANT ALL ON TABLE voz_acoes TO authenticated;

ALTER TABLE voz_acoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voz_acoes por cantina" ON voz_acoes;
CREATE POLICY "voz_acoes por cantina" ON voz_acoes
  FOR ALL USING (cantina_id = minha_cantina_id());

-- 3) Desfazer numa única transação: ou restaura tudo, ou nada.
--    Recusa (sem alterar nada) se a ação já foi desfeita ou se houve
--    movimentação posterior no mesmo aluno.
CREATE OR REPLACE FUNCTION desfazer_acao_voz(p_acao_id UUID, p_usuario UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_acao        voz_acoes%ROWTYPE;
  v_saldo       NUMERIC;
  v_conta_saldo NUMERIC;
  v_ciclo       JSONB;
  v_status      TEXT;
  v_corrigir    CONSTANT TEXT := ' Corrija manualmente pela tela de Alunos ou Cobranças.';
BEGIN
  SELECT * INTO v_acao FROM voz_acoes WHERE id = p_acao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'Ação não encontrada.');
  END IF;
  IF v_acao.desfeito_em IS NOT NULL THEN
    RETURN jsonb_build_object('erro', 'Esta ação já foi desfeita.');
  END IF;

  -- Saldo do aluno precisa estar exatamente como a ação deixou
  SELECT saldo INTO v_saldo FROM alunos WHERE id = v_acao.aluno_id FOR UPDATE;
  IF ROUND(COALESCE(v_saldo, 0), 2) <> v_acao.saldo_depois THEN
    RETURN jsonb_build_object('conflito',
      'O saldo do aluno mudou depois desta ação (esperado R$ ' || v_acao.saldo_depois ||
      ', atual R$ ' || ROUND(COALESCE(v_saldo, 0), 2) || ').' || v_corrigir);
  END IF;

  IF v_acao.conta_saldo_depois IS NOT NULL THEN
    SELECT saldo INTO v_conta_saldo FROM contas
      WHERE aluno_id = v_acao.aluno_id AND cantina_id = v_acao.cantina_id
      FOR UPDATE;
    IF ROUND(COALESCE(v_conta_saldo, 0), 2) <> v_acao.conta_saldo_depois THEN
      RETURN jsonb_build_object('conflito',
        'O saldo da conta do aluno mudou depois desta ação.' || v_corrigir);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pedidos
    WHERE aluno_id = v_acao.aluno_id AND status = 'confirmado' AND criado_em > v_acao.criado_em
  ) THEN
    RETURN jsonb_build_object('conflito',
      'O aluno fez compras depois desta ação.' || v_corrigir);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pagamentos
    WHERE aluno_id = v_acao.aluno_id AND status = 'confirmado' AND criado_em > v_acao.criado_em
      AND id IS DISTINCT FROM v_acao.pagamento_id
  ) THEN
    RETURN jsonb_build_object('conflito',
      'Há pagamentos ou recargas registrados depois desta ação.' || v_corrigir);
  END IF;

  FOR v_ciclo IN SELECT * FROM jsonb_array_elements(v_acao.ciclos_antes) LOOP
    SELECT status::text INTO v_status FROM ciclos_cobranca
      WHERE cantina_id = v_acao.cantina_id AND aluno_id = v_acao.aluno_id
        AND semana_inicio = (v_ciclo->>'semana_inicio')::date
      FOR UPDATE;
    IF v_status IS DISTINCT FROM 'pago' THEN
      RETURN jsonb_build_object('conflito',
        'Uma semana paga por esta ação foi alterada depois.' || v_corrigir);
    END IF;
  END LOOP;

  -- Restaura o estado anterior
  UPDATE alunos
    SET saldo = v_acao.saldo_antes,
        conta_paga = COALESCE(v_acao.conta_paga_antes, conta_paga)
    WHERE id = v_acao.aluno_id;

  IF v_acao.conta_saldo_antes IS NOT NULL THEN
    UPDATE contas
      SET saldo = v_acao.conta_saldo_antes, atualizado_em = NOW()
      WHERE aluno_id = v_acao.aluno_id AND cantina_id = v_acao.cantina_id;
  END IF;

  FOR v_ciclo IN SELECT * FROM jsonb_array_elements(v_acao.ciclos_antes) LOOP
    IF (v_ciclo->>'existia')::boolean THEN
      UPDATE ciclos_cobranca
        SET status          = (v_ciclo->>'status')::ciclo_status,
            forma_pagamento = v_ciclo->>'forma_pagamento',
            total           = (v_ciclo->>'total')::numeric
        WHERE cantina_id = v_acao.cantina_id AND aluno_id = v_acao.aluno_id
          AND semana_inicio = (v_ciclo->>'semana_inicio')::date;
    ELSE
      -- Ciclo criado pela ação: sem linha = semana em aberto
      DELETE FROM ciclos_cobranca
        WHERE cantina_id = v_acao.cantina_id AND aluno_id = v_acao.aluno_id
          AND semana_inicio = (v_ciclo->>'semana_inicio')::date;
    END IF;
  END LOOP;

  IF v_acao.pagamento_id IS NOT NULL THEN
    UPDATE pagamentos
      SET status = 'estornado',
          observacao = COALESCE(observacao, '') || ' [estornado pela Central de Voz]'
      WHERE id = v_acao.pagamento_id;
  END IF;

  UPDATE voz_acoes
    SET desfeito_em = NOW(), desfeito_por = p_usuario
    WHERE id = p_acao_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Só o servidor (service role) chama; nunca exposto ao anon
REVOKE ALL ON FUNCTION desfazer_acao_voz(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION desfazer_acao_voz(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION desfazer_acao_voz(UUID, UUID) TO service_role;

-- Atualiza o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
