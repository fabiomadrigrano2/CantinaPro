-- ============================================================================
-- CORREÇÃO: ciclos_cobranca — marcar como "pago" ciclos já quitados via saldo
--
-- Problema: pagamentos registrados via "Registrar Pgto" (antes de 2025-06-09)
-- atualizavam o saldo do aluno sem marcar os registros em ciclos_cobranca.
--
-- Lógica:
--   valor_já_pago = SUM(ciclos pendentes) − GREATEST(0, −saldo_atual)
--   Os ciclos mais antigos são marcados como "pago" na ordem cronológica
--   até o valor ser consumido. Ciclos parcialmente cobertos permanecem pendentes.
--
-- COMO USAR:
--   PASSO 1 — Execute o bloco "PRÉVIA" e revise os resultados.
--   PASSO 2 — Execute o bloco "CORREÇÃO" para aplicar as alterações.
--
-- SEGURANÇA:
--   • Idempotente: pode ser executado mais de uma vez sem efeito colateral.
--   • Não altera saldo de alunos nem de contas — apenas ciclos_cobranca.
--   • Usa timezone 'America/Sao_Paulo' para compatibilidade com o app.
-- ============================================================================


-- ── PASSO 1: Prévia (somente leitura) ───────────────────────────────────────
-- Execute este SELECT primeiro e confira quais ciclos serão alterados.

WITH weekly AS (
  -- Agrega total de pedidos por aluno/semana (idêntica lógica do app)
  SELECT
    p.aluno_id,
    date_trunc('week', p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date        AS semana_inicio,
    date_trunc('week', p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date + 6    AS semana_fim,
    ROUND(SUM(p.total)::numeric, 2)                                                AS total
  FROM pedidos p
  WHERE p.cantina_id = 'c7301d8b-890b-4775-986e-bb88979326f3'
    AND p.status = 'confirmado'
  GROUP BY p.aluno_id, semana_inicio, semana_fim
),
ciclos_efetivos AS (
  -- Junta com ciclos existentes; semanas sem registro assumem status 'aberto'
  SELECT
    w.aluno_id,
    w.semana_inicio,
    w.semana_fim,
    w.total,
    COALESCE(cc.status::text, 'aberto') AS status,
    cc.id                               AS ciclo_id
  FROM weekly w
  LEFT JOIN ciclos_cobranca cc
    ON  cc.aluno_id      = w.aluno_id
    AND cc.semana_inicio = w.semana_inicio
    AND cc.cantina_id    = 'c7301d8b-890b-4775-986e-bb88979326f3'
),
pendentes AS (
  SELECT * FROM ciclos_efetivos WHERE status <> 'pago'
),
aluno_stats AS (
  -- Calcula quanto já foi pago fora do sistema de ciclos:
  --   valor_ja_pago = total_pendentes − |saldo_devedor|
  -- Se o aluno zernou a dívida (saldo >= 0), todos os ciclos devem ser marcados.
  SELECT
    a.id                                                                    AS aluno_id,
    a.nome,
    ROUND(GREATEST(0, -a.saldo)::numeric, 2)                               AS saldo_devedor,
    ROUND(COALESCE(SUM(p.total), 0)::numeric, 2)                           AS total_pendentes,
    ROUND((COALESCE(SUM(p.total), 0) - GREATEST(0, -a.saldo))::numeric, 2) AS valor_ja_pago
  FROM alunos a
  LEFT JOIN pendentes p ON p.aluno_id = a.id
  WHERE a.cantina_id = 'c7301d8b-890b-4775-986e-bb88979326f3'
    AND a.tipo_conta  = 'fiado'
  GROUP BY a.id, a.nome, a.saldo
  -- Só traz alunos onde ciclos pendentes > saldo devedor (discrepância a corrigir)
  HAVING COALESCE(SUM(p.total), 0) > GREATEST(0, -a.saldo) + 0.005
),
running AS (
  -- Acumula totais em ordem cronológica para determinar até onde marcar
  SELECT
    p.aluno_id,
    p.semana_inicio,
    p.semana_fim,
    p.total,
    p.ciclo_id,
    s.nome,
    s.saldo_devedor,
    s.valor_ja_pago,
    ROUND(SUM(p.total) OVER (
      PARTITION BY p.aluno_id
      ORDER BY p.semana_inicio
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::numeric, 2) AS running_total
  FROM pendentes p
  JOIN aluno_stats s ON s.aluno_id = p.aluno_id
)
SELECT
  nome,
  semana_inicio,
  semana_fim,
  total                                                         AS total_ciclo,
  saldo_devedor,
  valor_ja_pago,
  running_total,
  CASE
    WHEN running_total <= valor_ja_pago + 0.005 THEN 'SERA MARCADO PAGO'
    ELSE                                              'permanece pendente'
  END AS acao
FROM running
ORDER BY nome, semana_inicio;


-- ── PASSO 2: Aplicar correção ────────────────────────────────────────────────
-- Execute este bloco após revisar a prévia acima.

DO $$
DECLARE
  cantina TEXT    := 'c7301d8b-890b-4775-986e-bb88979326f3';
  r       RECORD;
  cnt_upd INT     := 0;   -- ciclos existentes atualizados para "pago"
  cnt_ins INT     := 0;   -- novos registros inseridos como "pago"
BEGIN
  FOR r IN (
    WITH weekly AS (
      SELECT
        p.aluno_id,
        date_trunc('week', p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date     AS semana_inicio,
        date_trunc('week', p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date + 6 AS semana_fim,
        ROUND(SUM(p.total)::numeric, 2)                                             AS total
      FROM pedidos p
      WHERE p.cantina_id = cantina
        AND p.status = 'confirmado'
      GROUP BY p.aluno_id, semana_inicio, semana_fim
    ),
    ciclos_efetivos AS (
      SELECT
        w.aluno_id, w.semana_inicio, w.semana_fim, w.total,
        COALESCE(cc.status::text, 'aberto') AS status,
        cc.id AS ciclo_id
      FROM weekly w
      LEFT JOIN ciclos_cobranca cc
        ON  cc.aluno_id      = w.aluno_id
        AND cc.semana_inicio = w.semana_inicio
        AND cc.cantina_id    = cantina
    ),
    pendentes AS (
      SELECT * FROM ciclos_efetivos WHERE status <> 'pago'
    ),
    aluno_stats AS (
      SELECT
        a.id                                               AS aluno_id,
        GREATEST(0, -a.saldo)                             AS saldo_devedor,
        COALESCE(SUM(p.total), 0) - GREATEST(0, -a.saldo) AS valor_ja_pago
      FROM alunos a
      LEFT JOIN pendentes p ON p.aluno_id = a.id
      WHERE a.cantina_id = cantina
        AND a.tipo_conta  = 'fiado'
      GROUP BY a.id, a.saldo
      HAVING COALESCE(SUM(p.total), 0) > GREATEST(0, -a.saldo) + 0.005
    ),
    running AS (
      SELECT
        p.aluno_id, p.semana_inicio, p.semana_fim, p.total, p.ciclo_id,
        s.valor_ja_pago,
        SUM(p.total) OVER (
          PARTITION BY p.aluno_id
          ORDER BY p.semana_inicio
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_total
      FROM pendentes p
      JOIN aluno_stats s ON s.aluno_id = p.aluno_id
    )
    SELECT aluno_id, semana_inicio, semana_fim, total, ciclo_id
    FROM running
    WHERE running_total <= valor_ja_pago + 0.005
  )
  LOOP
    IF r.ciclo_id IS NOT NULL THEN
      -- Ciclo já existe: apenas atualiza o status
      UPDATE ciclos_cobranca
        SET status = 'pago'
      WHERE id = r.ciclo_id;
      cnt_upd := cnt_upd + 1;
    ELSE
      -- Ciclo nunca foi registrado: insere como pago
      -- ON CONFLICT garante idempotência caso o bloco seja executado mais de uma vez
      INSERT INTO ciclos_cobranca
        (cantina_id, aluno_id, semana_inicio, semana_fim, total, status)
      VALUES
        (cantina, r.aluno_id, r.semana_inicio, r.semana_fim, r.total, 'pago')
      ON CONFLICT (cantina_id, aluno_id, semana_inicio) DO UPDATE
        SET status = 'pago';
      cnt_ins := cnt_ins + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Concluido. Ciclos atualizados: %, inseridos como pagos: %', cnt_upd, cnt_ins;
END $$;
