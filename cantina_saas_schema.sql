-- ============================================================
--  CANTINA SAAS — Schema Multi-Tenant para Supabase
--  Cole este arquivo inteiro no SQL Editor do Supabase
--  (Database > SQL Editor > New Query) e execute.
--
--  CORREÇÕES APLICADAS:
--  1. Vírgula faltando após `dia_cobranca_mensal` na tabela cantinas
--  2. Reordenação de tabelas: categorias e produtos movidos para antes
--     de limites_aluno_produtos (que referencia produtos)
--  3. Coluna `role` em perfis agora é "role" (palavra reservada PostgreSQL)
-- ============================================================


-- ============================================================
-- EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE plano_tipo AS ENUM ('free', 'pro', 'premium');
CREATE TYPE assinatura_status AS ENUM ('ativa', 'suspensa', 'cancelada', 'trial');
CREATE TYPE conta_tipo AS ENUM ('credito', 'fiado');
CREATE TYPE pedido_status AS ENUM ('pendente', 'confirmado', 'cancelado');
CREATE TYPE transacao_tipo AS ENUM ('consumo', 'recarga', 'estorno', 'ajuste');
CREATE TYPE pagamento_status AS ENUM ('pendente', 'confirmado', 'cancelado');
CREATE TYPE ciclo_cobranca AS ENUM ('semanal', 'mensal');
CREATE TYPE cobranca_status AS ENUM ('pendente', 'enviada', 'paga', 'vencida');


-- ============================================================
-- TABELA: cantinas
-- ============================================================
CREATE TABLE cantinas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  escola          TEXT,
  cidade          TEXT,
  estado          CHAR(2),
  telefone        TEXT,
  email           TEXT UNIQUE NOT NULL,
  logo_url        TEXT,

  plano           plano_tipo NOT NULL DEFAULT 'free',
  assinatura      assinatura_status NOT NULL DEFAULT 'trial',
  trial_fim       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  assinatura_fim  TIMESTAMPTZ,

  limite_alunos   INTEGER NOT NULL DEFAULT 30,

  permite_fiado   BOOLEAN DEFAULT TRUE,
  limite_fiado    NUMERIC(10,2) DEFAULT 50.00,
  notif_saldo_min NUMERIC(10,2) DEFAULT 10.00,

  pix_chave       TEXT,
  pix_tipo        TEXT,
  pix_nome        TEXT,
  whatsapp_numero TEXT,
  -- FIX 1: vírgula que faltava aqui causava "syntax error at or near 'ativo'"
  dia_cobranca_mensal INTEGER,

  ativo           BOOLEAN DEFAULT TRUE,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_atualiza_limite_alunos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.limite_alunos := CASE NEW.plano
    WHEN 'free'    THEN 30
    WHEN 'pro'     THEN 150
    WHEN 'premium' THEN 999999
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_limite_alunos
  BEFORE INSERT OR UPDATE OF plano ON cantinas
  FOR EACH ROW EXECUTE FUNCTION fn_atualiza_limite_alunos();


-- ============================================================
-- TABELA: perfis
-- ============================================================
CREATE TABLE perfis (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cantina_id  UUID REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  -- FIX 3: "role" entre aspas — é palavra reservada do PostgreSQL
  "role"      TEXT NOT NULL DEFAULT 'admin',
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perfis_cantina ON perfis(cantina_id);


-- ============================================================
-- TABELA: turmas
-- ============================================================
CREATE TABLE turmas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turmas_cantina ON turmas(cantina_id);


-- ============================================================
-- TABELA: categorias
-- FIX 2: movida para antes de `produtos` e `limites_aluno_produtos`
-- ============================================================
CREATE TABLE categorias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  icone       TEXT,
  ordem       INTEGER DEFAULT 0
);

CREATE INDEX idx_categorias_cantina ON categorias(cantina_id);


-- ============================================================
-- TABELA: produtos
-- FIX 2: movida para antes de `limites_aluno_produtos`
-- ============================================================
CREATE TABLE produtos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  categoria_id  UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  preco         NUMERIC(10,2) NOT NULL,
  foto_url      TEXT,
  disponivel    BOOLEAN DEFAULT TRUE,
  estoque       INTEGER,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_produtos_cantina   ON produtos(cantina_id);
CREATE INDEX idx_produtos_categoria ON produtos(categoria_id);


-- ============================================================
-- TABELA: alunos
-- ============================================================
CREATE TABLE alunos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  turma_id    UUID REFERENCES turmas(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL,
  matricula   TEXT,
  foto_url    TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cantina_id, matricula)
);

CREATE INDEX idx_alunos_cantina ON alunos(cantina_id);
CREATE INDEX idx_alunos_turma   ON alunos(turma_id);


-- ============================================================
-- TABELA: responsaveis
-- ============================================================
CREATE TABLE responsaveis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id      UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome            TEXT NOT NULL,
  email           TEXT,
  celular         TEXT,
  whatsapp        TEXT,
  push_token      TEXT,

  ciclo_cobranca  ciclo_cobranca NOT NULL DEFAULT 'mensal',
  dia_cobranca    INTEGER,
  recebe_cobranca_whatsapp BOOLEAN DEFAULT TRUE,
  recebe_notif_consumo     BOOLEAN DEFAULT TRUE,

  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responsaveis_cantina ON responsaveis(cantina_id);
CREATE INDEX idx_responsaveis_user    ON responsaveis(user_id);


-- ============================================================
-- TABELA: aluno_responsavel
-- ============================================================
CREATE TABLE aluno_responsavel (
  aluno_id        UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  responsavel_id  UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  parentesco      TEXT,
  PRIMARY KEY (aluno_id, responsavel_id)
);


-- ============================================================
-- TABELA: contas
-- ============================================================
CREATE TABLE contas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id      UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id        UUID NOT NULL UNIQUE REFERENCES alunos(id) ON DELETE CASCADE,
  tipo            conta_tipo NOT NULL DEFAULT 'credito',
  saldo           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  limite_fiado    NUMERIC(10,2) DEFAULT 0.00,
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contas_cantina ON contas(cantina_id);


-- ============================================================
-- TABELA: limites_aluno
-- ============================================================
CREATE TABLE limites_aluno (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id            UUID NOT NULL UNIQUE REFERENCES alunos(id) ON DELETE CASCADE,
  limite_valor_diario NUMERIC(10,2),
  dias_permitidos     INTEGER[],
  configurado_por     TEXT DEFAULT 'responsavel',
  ativo               BOOLEAN DEFAULT TRUE,
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_limites_aluno_cantina ON limites_aluno(cantina_id);


-- ============================================================
-- TABELA: limites_aluno_produtos
-- (produtos já existe acima — forward reference resolvida)
-- ============================================================
CREATE TABLE limites_aluno_produtos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  produto_id    UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  qtd_maxima    INTEGER DEFAULT 1,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(aluno_id, produto_id)
);

CREATE INDEX idx_limites_produtos_aluno   ON limites_aluno_produtos(aluno_id);
CREATE INDEX idx_limites_produtos_cantina ON limites_aluno_produtos(cantina_id);


-- ============================================================
-- TABELA: pedidos
-- ============================================================
CREATE TABLE pedidos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES alunos(id),
  atendido_por  UUID REFERENCES perfis(id),
  status        pedido_status NOT NULL DEFAULT 'confirmado',
  total         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  observacao    TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pedidos_cantina ON pedidos(cantina_id);
CREATE INDEX idx_pedidos_aluno   ON pedidos(aluno_id);
CREATE INDEX idx_pedidos_criado  ON pedidos(criado_em DESC);


-- ============================================================
-- TABELA: itens_pedido
-- ============================================================
CREATE TABLE itens_pedido (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id    UUID NOT NULL REFERENCES produtos(id),
  nome_produto  TEXT NOT NULL,
  preco_unit    NUMERIC(10,2) NOT NULL,
  quantidade    INTEGER NOT NULL DEFAULT 1,
  subtotal      NUMERIC(10,2) GENERATED ALWAYS AS (preco_unit * quantidade) STORED
);

CREATE INDEX idx_itens_pedido ON itens_pedido(pedido_id);


-- ============================================================
-- TABELA: transacoes
-- ============================================================
CREATE TABLE transacoes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  conta_id      UUID NOT NULL REFERENCES contas(id),
  pedido_id     UUID REFERENCES pedidos(id),
  tipo          transacao_tipo NOT NULL,
  valor         NUMERIC(10,2) NOT NULL,
  saldo_apos    NUMERIC(10,2) NOT NULL,
  descricao     TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transacoes_cantina ON transacoes(cantina_id);
CREATE INDEX idx_transacoes_conta   ON transacoes(conta_id);
CREATE INDEX idx_transacoes_criado  ON transacoes(criado_em DESC);


-- ============================================================
-- TABELA: cobrancas
-- ============================================================
CREATE TABLE cobrancas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  responsavel_id      UUID NOT NULL REFERENCES responsaveis(id),
  ciclo               ciclo_cobranca NOT NULL,
  periodo_inicio      DATE NOT NULL,
  periodo_fim         DATE NOT NULL,
  valor_total         NUMERIC(10,2) NOT NULL,
  status              cobranca_status NOT NULL DEFAULT 'pendente',
  mensagem_whatsapp   TEXT,
  whatsapp_link       TEXT,
  enviada_em          TIMESTAMPTZ,
  lembrete_enviado_em TIMESTAMPTZ,
  paga_em             TIMESTAMPTZ,
  confirmada_por      UUID REFERENCES perfis(id),
  observacao          TEXT,
  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cobrancas_cantina     ON cobrancas(cantina_id);
CREATE INDEX idx_cobrancas_responsavel ON cobrancas(responsavel_id);
CREATE INDEX idx_cobrancas_status      ON cobrancas(status);
CREATE INDEX idx_cobrancas_periodo     ON cobrancas(periodo_fim);


-- ============================================================
-- TABELA: pagamentos
-- ============================================================
CREATE TABLE pagamentos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  conta_id            UUID NOT NULL REFERENCES contas(id),
  cobranca_id         UUID REFERENCES cobrancas(id),
  responsavel_id      UUID REFERENCES responsaveis(id),
  valor               NUMERIC(10,2) NOT NULL,
  status              pagamento_status NOT NULL DEFAULT 'pendente',
  pix_comprovante_url TEXT,
  pix_txid            TEXT,
  confirmado_por      UUID REFERENCES perfis(id),
  confirmado_em       TIMESTAMPTZ,
  observacao          TEXT,
  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pagamentos_cantina  ON pagamentos(cantina_id);
CREATE INDEX idx_pagamentos_conta    ON pagamentos(conta_id);
CREATE INDEX idx_pagamentos_cobranca ON pagamentos(cobranca_id);


-- ============================================================
-- TABELA: notificacoes
-- ============================================================
CREATE TABLE notificacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id      UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  responsavel_id  UUID NOT NULL REFERENCES responsaveis(id),
  pedido_id       UUID REFERENCES pedidos(id),
  titulo          TEXT NOT NULL,
  mensagem        TEXT NOT NULL,
  enviada         BOOLEAN DEFAULT FALSE,
  erro            TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notificacoes_cantina     ON notificacoes(cantina_id);
CREATE INDEX idx_notificacoes_responsavel ON notificacoes(responsavel_id);


-- ============================================================
-- FUNÇÃO: debitar saldo ao confirmar pedido
-- ============================================================
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

  -- Contas credito podem ficar negativas (sem bloqueio de saldo)

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

CREATE TRIGGER trg_debitar_pedido
  AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_debitar_pedido();


-- ============================================================
-- FUNÇÃO: creditar saldo ao confirmar pagamento
-- ============================================================
CREATE OR REPLACE FUNCTION fn_creditar_pagamento()
RETURNS TRIGGER AS $$
DECLARE
  v_conta      contas%ROWTYPE;
  v_novo_saldo NUMERIC(10,2);
BEGIN
  IF NEW.status <> 'confirmado' OR OLD.status = 'confirmado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_conta FROM contas WHERE id = NEW.conta_id;

  v_novo_saldo := v_conta.saldo + NEW.valor;

  UPDATE contas
    SET saldo = v_novo_saldo, atualizado_em = NOW()
    WHERE id = v_conta.id;

  INSERT INTO transacoes (cantina_id, conta_id, tipo, valor, saldo_apos, descricao)
  VALUES (
    NEW.cantina_id, NEW.conta_id,
    'recarga', NEW.valor, v_novo_saldo,
    'Pagamento via Pix confirmado manualmente'
  );

  IF NEW.cobranca_id IS NOT NULL THEN
    UPDATE cobrancas
      SET status = 'paga', paga_em = NOW()
      WHERE id = NEW.cobranca_id;
  END IF;

  NEW.confirmado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_creditar_pagamento
  BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION fn_creditar_pagamento();


-- ============================================================
-- FUNÇÃO: gera mensagem e link WhatsApp para cobrança
-- Uso: SELECT fn_gerar_link_cobranca('<cobranca_id>');
-- ============================================================
CREATE OR REPLACE FUNCTION fn_gerar_link_cobranca(p_cobranca_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_cobranca    cobrancas%ROWTYPE;
  v_responsavel responsaveis%ROWTYPE;
  v_cantina     cantinas%ROWTYPE;
  v_alunos      TEXT;
  v_mensagem    TEXT;
  v_link        TEXT;
  v_periodo     TEXT;
BEGIN
  SELECT * INTO v_cobranca    FROM cobrancas    WHERE id = p_cobranca_id;
  SELECT * INTO v_responsavel FROM responsaveis WHERE id = v_cobranca.responsavel_id;
  SELECT * INTO v_cantina     FROM cantinas      WHERE id = v_cobranca.cantina_id;

  SELECT STRING_AGG(a.nome, ', ')
    INTO v_alunos
    FROM aluno_responsavel ar
    JOIN alunos a ON a.id = ar.aluno_id
    WHERE ar.responsavel_id = v_responsavel.id;

  IF v_cobranca.ciclo = 'semanal' THEN
    v_periodo := 'semana de ' ||
      TO_CHAR(v_cobranca.periodo_inicio, 'DD/MM') || ' a ' ||
      TO_CHAR(v_cobranca.periodo_fim, 'DD/MM/YYYY');
  ELSE
    v_periodo := 'mes de ' || TO_CHAR(v_cobranca.periodo_inicio, 'MM/YYYY');
  END IF;

  v_mensagem :=
    'Cantina: ' || v_cantina.nome || CHR(10) ||
    CHR(10) ||
    'Ola, ' || v_responsavel.nome || '!' || CHR(10) ||
    CHR(10) ||
    'Consumo de ' || COALESCE(v_alunos, 'aluno') || ' referente ao ' || v_periodo || ':' || CHR(10) ||
    CHR(10) ||
    'Total: R$ ' || TO_CHAR(v_cobranca.valor_total, 'FM999G990D00') || CHR(10) ||
    CHR(10) ||
    'Pagamento via Pix:' || CHR(10) ||
    '  Chave: ' || COALESCE(v_cantina.pix_chave, 'a confirmar') || CHR(10) ||
    '  Favorecido: ' || COALESCE(v_cantina.pix_nome, v_cantina.nome) || CHR(10) ||
    CHR(10) ||
    'Apos o pagamento, envie o comprovante aqui. Obrigado!';

  v_link := 'https://wa.me/55' ||
    REGEXP_REPLACE(COALESCE(v_responsavel.whatsapp, v_responsavel.celular, ''), '[^0-9]', '', 'g') ||
    '?text=' ||
    REPLACE(REPLACE(v_mensagem, ' ', '%20'), CHR(10), '%0A');

  UPDATE cobrancas
    SET mensagem_whatsapp = v_mensagem,
        whatsapp_link     = v_link,
        status            = 'enviada',
        enviada_em        = NOW()
    WHERE id = p_cobranca_id;

  RETURN v_link;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE cantinas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis               ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aluno_responsavel    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE limites_aluno        ENABLE ROW LEVEL SECURITY;
ALTER TABLE limites_aluno_produtos ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FUNÇÕES auxiliares de RLS
-- ============================================================

CREATE OR REPLACE FUNCTION minha_cantina_id()
RETURNS UUID AS $$
  SELECT cantina_id FROM perfis WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION meu_responsavel_id()
RETURNS UUID AS $$
  SELECT id FROM responsaveis WHERE user_id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;


-- ============================================================
-- POLÍTICAS RLS
-- ============================================================

-- cantinas
CREATE POLICY "cantina_select" ON cantinas FOR SELECT USING (id = minha_cantina_id());
CREATE POLICY "cantina_update" ON cantinas FOR UPDATE USING (id = minha_cantina_id());

-- perfis
CREATE POLICY "perfis_cantina"  ON perfis FOR SELECT USING (cantina_id = minha_cantina_id());
CREATE POLICY "perfis_proprio"  ON perfis FOR SELECT USING (id = auth.uid());

-- turmas
CREATE POLICY "turmas_cantina" ON turmas FOR ALL USING (cantina_id = minha_cantina_id());

-- categorias
CREATE POLICY "categorias_cantina" ON categorias FOR ALL USING (cantina_id = minha_cantina_id());

-- produtos
CREATE POLICY "produtos_cantina" ON produtos FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "produtos_responsavel" ON produtos FOR SELECT USING (
  cantina_id IN (
    SELECT c.cantina_id FROM contas c
    JOIN aluno_responsavel ar ON ar.aluno_id = c.aluno_id
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- alunos
CREATE POLICY "alunos_cantina" ON alunos FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "alunos_responsavel" ON alunos FOR SELECT USING (
  id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- responsaveis
CREATE POLICY "responsaveis_cantina" ON responsaveis FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "responsaveis_proprio" ON responsaveis FOR SELECT USING (user_id = auth.uid());

-- aluno_responsavel
CREATE POLICY "aluno_responsavel_cantina" ON aluno_responsavel FOR ALL USING (
  aluno_id IN (SELECT id FROM alunos WHERE cantina_id = minha_cantina_id())
);

-- contas
CREATE POLICY "contas_cantina" ON contas FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "contas_responsavel" ON contas FOR SELECT USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- limites_aluno
CREATE POLICY "limites_cantina" ON limites_aluno FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "limites_responsavel_select" ON limites_aluno FOR SELECT USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);
CREATE POLICY "limites_responsavel_update" ON limites_aluno FOR UPDATE USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- limites_aluno_produtos
CREATE POLICY "limites_prod_cantina" ON limites_aluno_produtos FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "limites_prod_responsavel_select" ON limites_aluno_produtos FOR SELECT USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);
CREATE POLICY "limites_prod_responsavel_all" ON limites_aluno_produtos FOR ALL USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- pedidos
CREATE POLICY "pedidos_cantina" ON pedidos FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "pedidos_responsavel" ON pedidos FOR SELECT USING (
  aluno_id IN (
    SELECT ar.aluno_id FROM aluno_responsavel ar
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- itens_pedido
CREATE POLICY "itens_cantina" ON itens_pedido FOR ALL USING (
  pedido_id IN (SELECT id FROM pedidos WHERE cantina_id = minha_cantina_id())
);
CREATE POLICY "itens_responsavel" ON itens_pedido FOR SELECT USING (
  pedido_id IN (
    SELECT p.id FROM pedidos p
    JOIN aluno_responsavel ar ON ar.aluno_id = p.aluno_id
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- transacoes
CREATE POLICY "transacoes_cantina" ON transacoes FOR ALL USING (cantina_id = minha_cantina_id());
CREATE POLICY "transacoes_responsavel" ON transacoes FOR SELECT USING (
  conta_id IN (
    SELECT c.id FROM contas c
    JOIN aluno_responsavel ar ON ar.aluno_id = c.aluno_id
    WHERE ar.responsavel_id = meu_responsavel_id()
  )
);

-- cobrancas
CREATE POLICY "cobrancas_cantina"     ON cobrancas FOR ALL    USING (cantina_id = minha_cantina_id());
CREATE POLICY "cobrancas_responsavel" ON cobrancas FOR SELECT USING (responsavel_id = meu_responsavel_id());

-- pagamentos
CREATE POLICY "pagamentos_cantina"     ON pagamentos FOR ALL    USING (cantina_id = minha_cantina_id());
CREATE POLICY "pagamentos_responsavel" ON pagamentos FOR SELECT USING (responsavel_id = meu_responsavel_id());

-- notificacoes
CREATE POLICY "notificacoes_cantina"     ON notificacoes FOR ALL    USING (cantina_id = minha_cantina_id());
CREATE POLICY "notificacoes_responsavel" ON notificacoes FOR SELECT USING (responsavel_id = meu_responsavel_id());


-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE transacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE contas;
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE cobrancas;


-- ============================================================
-- DADOS DE EXEMPLO (descomente para testar)
-- ============================================================

/*
INSERT INTO cantinas (nome, escola, cidade, estado, email, plano, assinatura)
VALUES ('Cantina Exemplo', 'Escola Municipal Centro', 'Sao Paulo', 'SP', 'cantina@exemplo.com', 'pro', 'ativa');

-- Apos criar o usuario no Auth, vincule ao perfil:
-- INSERT INTO perfis (id, cantina_id, nome, "role")
-- VALUES ('<UUID_DO_AUTH_USER>', '<UUID_DA_CANTINA>', 'Dono da Cantina', 'admin');
*/


-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
-- Proximos passos:
--   1. Execute este arquivo no SQL Editor do Supabase
--   2. Crie seu usuario em Authentication > Users
--   3. Insira sua cantina na tabela `cantinas`
--   4. Vincule o usuario ao perfil em `perfis`
--   5. Para cobranca: SELECT fn_gerar_link_cobranca('<id>');
--   6. Ao receber Pix: UPDATE pagamentos SET status='confirmado' WHERE id='<id>'
-- ============================================================
