-- Migration: permite saldo negativo para contas do tipo 'credito'
-- Antes: o trigger bloqueava a venda se saldo ficasse < 0 para tipo credito
-- Depois: apenas o limite de fiado é verificado; credito pode ficar negativo igual ao fiado

CREATE OR REPLACE FUNCTION fn_debitar_pedido()
RETURNS TRIGGER AS $$
DECLARE
  v_conta          contas%ROWTYPE;
  v_novo_saldo     NUMERIC(10,2);
  v_limite         limites_aluno%ROWTYPE;
  v_gasto_hoje     NUMERIC(10,2);
  v_dia_semana     INTEGER;
  v_produto        RECORD;
  v_qtd_hoje       INTEGER;
  v_qtd_maxima     INTEGER;
  v_tem_lista      BOOLEAN;
BEGIN
  IF NEW.status <> 'confirmado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_conta FROM contas WHERE aluno_id = NEW.aluno_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta nao encontrada para o aluno %', NEW.aluno_id;
  END IF;

  SELECT * INTO v_limite FROM limites_aluno
    WHERE aluno_id = NEW.aluno_id AND ativo = TRUE;

  IF FOUND THEN
    IF v_limite.dias_permitidos IS NOT NULL THEN
      v_dia_semana := EXTRACT(DOW FROM NOW())::INTEGER;
      IF NOT (v_dia_semana = ANY(v_limite.dias_permitidos)) THEN
        RAISE EXCEPTION 'Este aluno nao tem permissao para comprar hoje (dia %).', v_dia_semana;
      END IF;
    END IF;

    IF v_limite.limite_valor_diario IS NOT NULL THEN
      SELECT COALESCE(SUM(p.total), 0) INTO v_gasto_hoje
        FROM pedidos p
        WHERE p.aluno_id = NEW.aluno_id
          AND p.status = 'confirmado'
          AND p.criado_em::DATE = NOW()::DATE;

      IF (v_gasto_hoje + NEW.total) > v_limite.limite_valor_diario THEN
        RAISE EXCEPTION 'Limite diario de R$ % atingido. Ja consumiu R$ % hoje.',
          v_limite.limite_valor_diario, v_gasto_hoje;
      END IF;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM limites_aluno_produtos WHERE aluno_id = NEW.aluno_id
    ) INTO v_tem_lista;

    IF v_tem_lista THEN
      FOR v_produto IN
        SELECT ip.produto_id, ip.quantidade
          FROM itens_pedido ip WHERE ip.pedido_id = NEW.id
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM limites_aluno_produtos
          WHERE aluno_id = NEW.aluno_id AND produto_id = v_produto.produto_id
        ) THEN
          RAISE EXCEPTION 'Produto nao permitido para este aluno.';
        END IF;

        SELECT COALESCE(SUM(ip2.quantidade), 0) INTO v_qtd_hoje
          FROM itens_pedido ip2
          JOIN pedidos p2 ON p2.id = ip2.pedido_id
          WHERE p2.aluno_id = NEW.aluno_id
            AND p2.status = 'confirmado'
            AND p2.criado_em::DATE = NOW()::DATE
            AND ip2.produto_id = v_produto.produto_id;

        SELECT qtd_maxima INTO v_qtd_maxima
          FROM limites_aluno_produtos
          WHERE aluno_id = NEW.aluno_id AND produto_id = v_produto.produto_id;

        IF (v_qtd_hoje + v_produto.quantidade) > v_qtd_maxima THEN
          RAISE EXCEPTION 'Quantidade maxima diaria deste produto (%) atingida para este aluno.', v_qtd_maxima;
        END IF;
      END LOOP;
    END IF;
  END IF;

  v_novo_saldo := v_conta.saldo - NEW.total;

  -- Removido: bloqueio de saldo negativo para tipo 'credito'
  -- Contas credito agora podem ficar negativas (igual ao fiado, sem limite explicito)

  IF v_conta.tipo = 'fiado' AND v_novo_saldo < (v_conta.limite_fiado * -1) THEN
    RAISE EXCEPTION 'Limite de fiado atingido. Limite: R$ %', v_conta.limite_fiado;
  END IF;

  UPDATE contas
    SET saldo = v_novo_saldo, atualizado_em = NOW()
    WHERE id = v_conta.id;

  INSERT INTO transacoes (cantina_id, conta_id, pedido_id, tipo, valor, saldo_apos, descricao)
  VALUES (
    NEW.cantina_id, v_conta.id, NEW.id,
    'consumo', NEW.total * -1, v_novo_saldo,
    'Pedido registrado na cantina'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
