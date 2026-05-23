-- ============================================================
--  🍎 CANTINA SAAS — Schema Multi-Tenant para Supabase
--  Criado para: SaaS de gestão de cantina escolar
--  Instruções: Cole este arquivo inteiro no SQL Editor do
--  Supabase (Database > SQL Editor > New Query) e execute.
-- ============================================================


-- ============================================================
-- EXTENSÕES NECESSÁRIAS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- ENUM TYPES
-- (tipos reutilizáveis em várias tabelas)
-- ============================================================

-- Tipos de plano da cantina (seu modelo de monetização)
CREATE TYPE plano_tipo AS ENUM ('free', 'pro', 'premium');

-- Status da assinatura da cantina
CREATE TYPE assinatura_status AS ENUM ('ativa', 'suspensa', 'cancelada', 'trial');

-- Tipo de conta do aluno
CREATE TYPE conta_tipo AS ENUM ('credito', 'fiado');

-- Status do pedido
CREATE TYPE pedido_status AS ENUM ('pendente', 'confirmado', 'cancelado');

-- Tipo de transação financeira
CREATE TYPE transacao_tipo AS ENUM ('consumo', 'recarga', 'estorno', 'ajuste');

-- Status do pagamento (confirmação manual pelo dono da cantina)
CREATE TYPE pagamento_status AS ENUM ('pendente', 'confirmado', 'cancelado');

-- Ciclo de cobrança do responsável
CREATE TYPE ciclo_cobranca AS ENUM ('semanal', 'mensal');

-- Status da cobrança enviada por WhatsApp
CREATE TYPE cobranca_status AS ENUM ('pendente', 'enviada', 'paga', 'vencida');


-- ============================================================
-- TABELA: cantinas
-- (cada dono de cantina é um "tenant")
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

  -- Plano e assinatura
  plano           plano_tipo NOT NULL DEFAULT 'free',
  assinatura      assinatura_status NOT NULL DEFAULT 'trial',
  trial_fim       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  assinatura_fim  TIMESTAMPTZ,

  -- Limites por plano (calculados automaticamente via trigger)
  limite_alunos   INTEGER NOT NULL DEFAULT 30,

  -- Configurações da cantina
  permite_fiado   BOOLEAN DEFAULT TRUE,
  limite_fiado    NUMERIC(10,2) DEFAULT 50.00,
  notif_saldo_min NUMERIC(10,2) DEFAULT 10.00, -- avisa pai quando saldo < este valor

  -- Pix e WhatsApp (para cobrança sem gateway)
  pix_chave       TEXT,        -- chave Pix da cantina (CPF, email, celular ou aleatória)
  pix_tipo        TEXT,        -- 'cpf' | 'email' | 'celular' | 'aleatoria'
  pix_nome        TEXT,        -- nome do titular da chave Pix
  whatsapp_numero TEXT,        -- número do WhatsApp da cantina (para o pai responder)
  dia_cobranca_mensal INTEGER  -- dia do mês para cobranças mensais (ex: 5 = todo dia 5)

  -- Controle
  ativo           BOOLEAN DEFAULT TRUE,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Atualiza limite_alunos automaticamente quando o plano muda
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
-- (vincula o usuário do Supabase Auth a uma cantina)
-- Cada usuário autenticado tem um perfil aqui.
-- ============================================================
CREATE TABLE perfis (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cantina_id  UUID REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin', -- 'admin' | 'atendente'
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida por cantina
CREATE INDEX idx_perfis_cantina ON perfis(cantina_id);


-- ============================================================
-- TABELA: turmas
-- (turmas/séries da escola — para organizar alunos)
-- ============================================================
CREATE TABLE turmas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,  -- ex: "3º Ano A", "2º Médio"
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turmas_cantina ON turmas(cantina_id);


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

  UNIQUE(cantina_id, matricula) -- matrícula única por cantina
);

CREATE INDEX idx_alunos_cantina ON alunos(cantina_id);
CREATE INDEX idx_alunos_turma   ON alunos(turma_id);


-- ============================================================
-- TABELA: responsaveis
-- (pais/responsáveis — podem ter conta no app dos pais)
-- ============================================================
CREATE TABLE responsaveis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id      UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- conta no app dos pais
  nome            TEXT NOT NULL,
  email           TEXT,
  celular         TEXT,        -- com DDD, ex: 11999998888
  whatsapp        TEXT,        -- pode ser diferente do celular
  push_token      TEXT,        -- token do Firebase para notificações push

  -- Configuração de cobrança por WhatsApp
  ciclo_cobranca  ciclo_cobranca NOT NULL DEFAULT 'mensal',
  dia_cobranca    INTEGER,     -- para mensal: dia do mês (1-28); para semanal: ignorado (sempre sexta)
  recebe_cobranca_whatsapp BOOLEAN DEFAULT TRUE,
  recebe_notif_consumo     BOOLEAN DEFAULT TRUE, -- notificação a cada pedido

  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responsaveis_cantina  ON responsaveis(cantina_id);
CREATE INDEX idx_responsaveis_user     ON responsaveis(user_id);


-- ============================================================
-- TABELA: aluno_responsavel
-- (relação N:N — um aluno pode ter vários responsáveis)
-- ============================================================
CREATE TABLE aluno_responsavel (
  aluno_id        UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  responsavel_id  UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  parentesco      TEXT, -- 'pai', 'mãe', 'avó', etc.
  PRIMARY KEY (aluno_id, responsavel_id)
);


-- ============================================================
-- TABELA: contas
-- (saldo/fiado de cada aluno — uma conta por aluno)
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
-- (regras de consumo diário por aluno — configurado pelo pai ou cantina)
-- Suporta dois modos: limite de valor OU lista de produtos permitidos
-- Os dois podem coexistir no mesmo aluno
-- ============================================================
CREATE TABLE limites_aluno (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id            UUID NOT NULL UNIQUE REFERENCES alunos(id) ON DELETE CASCADE,

  -- Modo 1: limite de valor diário
  limite_valor_diario NUMERIC(10,2),   -- ex: 12.00 → máximo R$12 por dia
                                        -- NULL = sem limite de valor

  -- Modo 2: controle por dias da semana
  -- (ex: só segunda, quarta e sexta pode comprar)
  dias_permitidos     INTEGER[],        -- array com dias: 0=dom,1=seg,...,6=sab
                                        -- NULL = todos os dias liberados

  -- Configurado por quem
  configurado_por     TEXT DEFAULT 'responsavel', -- 'responsavel' | 'cantina'

  ativo               BOOLEAN DEFAULT TRUE,
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_limites_aluno_cantina ON limites_aluno(cantina_id);


-- ============================================================
-- TABELA: limites_aluno_produtos
-- (lista de produtos permitidos por aluno — modo lista)
-- Se esta tabela tiver registros para um aluno, ele SÓ pode
-- comprar os produtos listados aqui
-- ============================================================
CREATE TABLE limites_aluno_produtos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  produto_id    UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  qtd_maxima    INTEGER DEFAULT 1,    -- quantas vezes pode comprar esse produto por dia
  criado_em     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(aluno_id, produto_id)        -- um produto aparece uma vez por aluno
);

CREATE INDEX idx_limites_produtos_aluno   ON limites_aluno_produtos(aluno_id);
CREATE INDEX idx_limites_produtos_cantina ON limites_aluno_produtos(cantina_id);


-- ============================================================
-- TABELA: categorias
-- (categorias dos produtos: lanche, bebida, sobremesa...)
-- ============================================================
CREATE TABLE categorias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id  UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  icone       TEXT, -- emoji ou nome do ícone
  ordem       INTEGER DEFAULT 0
);

CREATE INDEX idx_categorias_cantina ON categorias(cantina_id);


-- ============================================================
-- TABELA: produtos
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
  estoque       INTEGER, -- NULL = sem controle de estoque
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_produtos_cantina   ON produtos(cantina_id);
CREATE INDEX idx_produtos_categoria ON produtos(categoria_id);


-- ============================================================
-- TABELA: pedidos
-- (cada compra do aluno na cantina)
-- ============================================================
CREATE TABLE pedidos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  aluno_id      UUID NOT NULL REFERENCES alunos(id),
  atendido_por  UUID REFERENCES perfis(id), -- quem registrou (você ou funcionário)
  status        pedido_status NOT NULL DEFAULT 'confirmado',
  total         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  observacao    TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pedidos_cantina  ON pedidos(cantina_id);
CREATE INDEX idx_pedidos_aluno    ON pedidos(aluno_id);
CREATE INDEX idx_pedidos_criado   ON pedidos(criado_em DESC);


-- ============================================================
-- TABELA: itens_pedido
-- (produtos dentro de cada pedido)
-- ============================================================
CREATE TABLE itens_pedido (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id    UUID NOT NULL REFERENCES produtos(id),
  nome_produto  TEXT NOT NULL, -- salva o nome no momento da compra (histórico)
  preco_unit    NUMERIC(10,2) NOT NULL,
  quantidade    INTEGER NOT NULL DEFAULT 1,
  subtotal      NUMERIC(10,2) GENERATED ALWAYS AS (preco_unit * quantidade) STORED
);

CREATE INDEX idx_itens_pedido ON itens_pedido(pedido_id);


-- ============================================================
-- TABELA: transacoes
-- (histórico financeiro completo da conta do aluno)
-- ============================================================
CREATE TABLE transacoes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id    UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  conta_id      UUID NOT NULL REFERENCES contas(id),
  pedido_id     UUID REFERENCES pedidos(id),
  tipo          transacao_tipo NOT NULL,
  valor         NUMERIC(10,2) NOT NULL, -- positivo = entrada, negativo = saída
  saldo_apos    NUMERIC(10,2) NOT NULL, -- saldo da conta após esta transação
  descricao     TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transacoes_cantina ON transacoes(cantina_id);
CREATE INDEX idx_transacoes_conta   ON transacoes(conta_id);
CREATE INDEX idx_transacoes_criado  ON transacoes(criado_em DESC);


-- ============================================================
-- TABELA: cobranças
-- (cada mensagem de cobrança gerada e enviada via WhatsApp)
-- ============================================================
CREATE TABLE cobrancas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  responsavel_id      UUID NOT NULL REFERENCES responsaveis(id),
  ciclo               ciclo_cobranca NOT NULL,
  periodo_inicio      DATE NOT NULL,   -- início do período cobrado
  periodo_fim         DATE NOT NULL,   -- fim do período cobrado
  valor_total         NUMERIC(10,2) NOT NULL,
  status              cobranca_status NOT NULL DEFAULT 'pendente',

  -- Mensagem gerada para o WhatsApp
  mensagem_whatsapp   TEXT,            -- texto completo que será enviado
  whatsapp_link       TEXT,            -- link wa.me já montado com a mensagem

  -- Controle de envio
  enviada_em          TIMESTAMPTZ,
  lembrete_enviado_em TIMESTAMPTZ,     -- segundo lembrete caso não pague

  -- Confirmação manual do pagamento pelo dono da cantina
  paga_em             TIMESTAMPTZ,
  confirmada_por      UUID REFERENCES perfis(id),
  observacao          TEXT,

  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cobrancas_cantina      ON cobrancas(cantina_id);
CREATE INDEX idx_cobrancas_responsavel  ON cobrancas(responsavel_id);
CREATE INDEX idx_cobrancas_status       ON cobrancas(status);
CREATE INDEX idx_cobrancas_periodo      ON cobrancas(periodo_fim);


-- ============================================================
-- TABELA: pagamentos
-- (registro quando o dono confirma que recebeu o Pix)
-- Sem gateway — o dono confirma manualmente no app
-- ============================================================
CREATE TABLE pagamentos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id          UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  conta_id            UUID NOT NULL REFERENCES contas(id),
  cobranca_id         UUID REFERENCES cobrancas(id),  -- cobrança que originou o pagamento
  responsavel_id      UUID REFERENCES responsaveis(id),
  valor               NUMERIC(10,2) NOT NULL,
  status              pagamento_status NOT NULL DEFAULT 'pendente',

  -- Dados do Pix recebido (preenchidos manualmente ou via confirmação)
  pix_comprovante_url TEXT,    -- foto do comprovante, se o pai enviar
  pix_txid            TEXT,    -- ID da transação Pix, se quiser registrar

  -- Quem confirmou o recebimento
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
-- (log de notificações enviadas aos pais)
-- ============================================================
CREATE TABLE notificacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantina_id      UUID NOT NULL REFERENCES cantinas(id) ON DELETE CASCADE,
  responsavel_id  UUID NOT NULL REFERENCES responsaveis(id),
  pedido_id       UUID REFERENCES pedidos(id),
  titulo          TEXT NOT NULL,
  mensagem        TEXT NOT NULL,
  enviada         BOOLEAN DEFAULT FALSE,
  erro            TEXT, -- mensagem de erro se falhou
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notificacoes_cantina      ON notificacoes(cantina_id);
CREATE INDEX idx_notificacoes_responsavel  ON notificacoes(responsavel_id);


-- ============================================================
-- FUNÇÃO: debitar saldo automaticamente ao confirmar pedido
-- (chamada via trigger quando pedido é inserido)
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
  -- Só processa pedidos confirmados
  IF NEW.status <> 'confirmado' THEN
    RETURN NEW;
  END IF;

  -- Busca a conta do aluno
  SELECT * INTO v_conta FROM contas WHERE aluno_id = NEW.aluno_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada para o aluno %', NEW.aluno_id;
  END IF;

  -- -------------------------------------------------------
  -- VALIDAÇÃO DE LIMITES DO ALUNO
  -- -------------------------------------------------------
  SELECT * INTO v_limite FROM limites_aluno
    WHERE aluno_id = NEW.aluno_id AND ativo = TRUE;

  IF FOUND THEN

    -- Verifica dia da semana permitido
    IF v_limite.dias_permitidos IS NOT NULL THEN
      v_dia_semana := EXTRACT(DOW FROM NOW())::INTEGER;
      IF NOT (v_dia_semana = ANY(v_limite.dias_permitidos)) THEN
        RAISE EXCEPTION 'Este aluno não tem permissão para comprar hoje (dia %).', v_dia_semana;
      END IF;
    END IF;

    -- Verifica limite de valor diário
    IF v_limite.limite_valor_diario IS NOT NULL THEN
      SELECT COALESCE(SUM(p.total), 0) INTO v_gasto_hoje
        FROM pedidos p
        WHERE p.aluno_id = NEW.aluno_id
          AND p.status = 'confirmado'
          AND p.criado_em::DATE = NOW()::DATE;

      IF (v_gasto_hoje + NEW.total) > v_limite.limite_valor_diario THEN
        RAISE EXCEPTION 'Limite diário de R$ % atingido. Já consumiu R$ % hoje.',
          v_limite.limite_valor_diario, v_gasto_hoje;
      END IF;
    END IF;

    -- Verifica lista de produtos permitidos
    SELECT EXISTS (
      SELECT 1 FROM limites_aluno_produtos
      WHERE aluno_id = NEW.aluno_id
    ) INTO v_tem_lista;

    IF v_tem_lista THEN
      -- Percorre cada item do pedido e valida
      FOR v_produto IN
        SELECT ip.produto_id, ip.quantidade
          FROM itens_pedido ip
          WHERE ip.pedido_id = NEW.id
      LOOP
        -- Produto está na lista permitida?
        IF NOT EXISTS (
          SELECT 1 FROM limites_aluno_produtos
          WHERE aluno_id = NEW.aluno_id AND produto_id = v_produto.produto_id
        ) THEN
          RAISE EXCEPTION 'Produto não permitido para este aluno.';
        END IF;

        -- Quantidade já comprada hoje deste produto
        SELECT COALESCE(SUM(ip2.quantidade), 0) INTO v_qtd_hoje
          FROM itens_pedido ip2
          JOIN pedidos p2 ON p2.id = ip2.pedido_id
          WHERE p2.aluno_id = NEW.aluno_id
            AND p2.status = 'confirmado'
            AND p2.criado_em::DATE = NOW()::DATE
            AND ip2.produto_id = v_produto.produto_id;

        -- Quantidade máxima permitida por dia deste produto
        SELECT qtd_maxima INTO v_qtd_maxima
          FROM limites_aluno_produtos
          WHERE aluno_id = NEW.aluno_id AND produto_id = v_produto.produto_id;

        IF (v_qtd_hoje + v_produto.quantidade) > v_qtd_maxima THEN
          RAISE EXCEPTION 'Quantidade máxima diária deste produto (%) atingida para este aluno.', v_qtd_maxima;
        END IF;
      END LOOP;
    END IF;

  END IF;
  -- -------------------------------------------------------
  -- FIM DAS VALIDAÇÕES DE LIMITE
  -- -------------------------------------------------------

  v_novo_saldo := v_conta.saldo - NEW.total;

  -- Verifica limite (crédito não pode ficar negativo; fiado respeita limite)
  IF v_conta.tipo = 'credito' AND v_novo_saldo < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente. Saldo atual: R$ %', v_conta.saldo;
  END IF;

  IF v_conta.tipo = 'fiado' AND v_novo_saldo < (v_conta.limite_fiado * -1) THEN
    RAISE EXCEPTION 'Limite de fiado atingido. Limite: R$ %', v_conta.limite_fiado;
  END IF;

  -- Atualiza saldo
  UPDATE contas
    SET saldo = v_novo_saldo, atualizado_em = NOW()
    WHERE id = v_conta.id;

  -- Registra transação
  INSERT INTO transacoes (cantina_id, conta_id, pedido_id, tipo, valor, saldo_apos, descricao)
  VALUES (
    NEW.cantina_id,
    v_conta.id,
    NEW.id,
    'consumo',
    NEW.total * -1,
    v_novo_saldo,
    'Pedido registrado na cantina'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_debitar_pedido
  AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_debitar_pedido();


-- ============================================================
-- FUNÇÃO: creditar saldo ao confirmar pagamento manual
-- ============================================================
CREATE OR REPLACE FUNCTION fn_creditar_pagamento()
RETURNS TRIGGER AS $$
DECLARE
  v_conta      contas%ROWTYPE;
  v_novo_saldo NUMERIC(10,2);
BEGIN
  -- Só processa quando status muda para 'confirmado'
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
    NEW.cantina_id,
    NEW.conta_id,
    'recarga',
    NEW.valor,
    v_novo_saldo,
    'Pagamento via Pix confirmado manualmente'
  );

  -- Marca a cobrança como paga também
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
  SELECT * INTO v_cobranca   FROM cobrancas    WHERE id = p_cobranca_id;
  SELECT * INTO v_responsavel FROM responsaveis WHERE id = v_cobranca.responsavel_id;
  SELECT * INTO v_cantina    FROM cantinas      WHERE id = v_cobranca.cantina_id;

  -- Monta lista de alunos do responsável
  SELECT STRING_AGG(a.nome, ', ')
    INTO v_alunos
    FROM aluno_responsavel ar
    JOIN alunos a ON a.id = ar.aluno_id
    WHERE ar.responsavel_id = v_responsavel.id;

  -- Formata período
  IF v_cobranca.ciclo = 'semanal' THEN
    v_periodo := 'semana de ' ||
      TO_CHAR(v_cobranca.periodo_inicio, 'DD/MM') || ' a ' ||
      TO_CHAR(v_cobranca.periodo_fim, 'DD/MM/YYYY');
  ELSE
    v_periodo := 'mês de ' || TO_CHAR(v_cobranca.periodo_inicio, 'MM/YYYY');
  END IF;

  -- Monta mensagem
  v_mensagem :=
    '🍎 *' || v_cantina.nome || '* — Cobrança' || CHR(10) ||
    CHR(10) ||
    'Olá, *' || v_responsavel.nome || '*! 👋' || CHR(10) ||
    CHR(10) ||
    'Segue o resumo de consumo do(a) *' || COALESCE(v_alunos, 'aluno') || '* referente à ' || v_periodo || ':' || CHR(10) ||
    CHR(10) ||
    '💰 *Total: R$ ' || TO_CHAR(v_cobranca.valor_total, 'FM999G990D00') || '*' || CHR(10) ||
    CHR(10) ||
    '📲 *Pagamento via Pix:*' || CHR(10) ||
    '   Chave: ' || COALESCE(v_cantina.pix_chave, 'a confirmar') || CHR(10) ||
    '   Favorecido: ' || COALESCE(v_cantina.pix_nome, v_cantina.nome) || CHR(10) ||
    CHR(10) ||
    'Após o pagamento, envie o comprovante aqui. ✅' || CHR(10) ||
    'Obrigado! 🙏';

  -- Monta link wa.me (encode básico para URL)
  v_link := 'https://wa.me/55' ||
    REGEXP_REPLACE(COALESCE(v_responsavel.whatsapp, v_responsavel.celular, ''), '[^0-9]', '', 'g') ||
    '?text=' ||
    REPLACE(REPLACE(REPLACE(v_mensagem, ' ', '%20'), CHR(10), '%0A'), '*', '%2A');

  -- Salva mensagem e link na cobrança
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
-- ROW LEVEL SECURITY (RLS)
-- Cada cantina só vê seus próprios dados. ESSENCIAL para multi-tenant.
-- ============================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE cantinas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis            ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE aluno_responsavel ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes      ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FUNÇÃO auxiliar: retorna o cantina_id do usuário logado
-- ============================================================
CREATE OR REPLACE FUNCTION minha_cantina_id()
RETURNS UUID AS $$
  SELECT cantina_id FROM perfis WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- FUNÇÃO auxiliar: retorna o responsavel_id do usuário logado (app dos pais)
CREATE OR REPLACE FUNCTION meu_responsavel_id()
RETURNS UUID AS $$
  SELECT id FROM responsaveis WHERE user_id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;


-- ============================================================
-- POLÍTICAS: limites_aluno e limites_aluno_produtos
-- ============================================================
ALTER TABLE limites_aluno          ENABLE ROW LEVEL SECURITY;
ALTER TABLE limites_aluno_produtos ENABLE ROW LEVEL SECURITY;

-- Cantina gerencia todos os limites
CREATE POLICY "Cantina gerencia limites"
  ON limites_aluno FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Cantina gerencia limites de produtos"
  ON limites_aluno_produtos FOR ALL
  USING (cantina_id = minha_cantina_id());

-- Responsável vê e configura limites dos seus filhos
CREATE POLICY "Responsável vê limites dos filhos"
  ON limites_aluno FOR SELECT
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );

CREATE POLICY "Responsável configura limites dos filhos"
  ON limites_aluno FOR UPDATE
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );

CREATE POLICY "Responsável vê lista de produtos dos filhos"
  ON limites_aluno_produtos FOR SELECT
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );

CREATE POLICY "Responsável edita lista de produtos dos filhos"
  ON limites_aluno_produtos FOR ALL
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: cantinas
-- ============================================================
CREATE POLICY "Cantina vê somente a si mesma"
  ON cantinas FOR SELECT
  USING (id = minha_cantina_id());

CREATE POLICY "Cantina atualiza somente a si mesma"
  ON cantinas FOR UPDATE
  USING (id = minha_cantina_id());


-- ============================================================
-- POLÍTICAS: perfis
-- ============================================================
CREATE POLICY "Perfil vê somente sua cantina"
  ON perfis FOR SELECT
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Usuário vê seu próprio perfil"
  ON perfis FOR SELECT
  USING (id = auth.uid());


-- ============================================================
-- POLÍTICAS: turmas
-- ============================================================
CREATE POLICY "Turmas da minha cantina"
  ON turmas FOR ALL
  USING (cantina_id = minha_cantina_id());


-- ============================================================
-- POLÍTICAS: alunos
-- ============================================================
CREATE POLICY "Alunos da minha cantina"
  ON alunos FOR ALL
  USING (cantina_id = minha_cantina_id());

-- Responsável vê os filhos dele
CREATE POLICY "Responsável vê seus alunos"
  ON alunos FOR SELECT
  USING (
    id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: responsaveis
-- ============================================================
CREATE POLICY "Responsáveis da minha cantina"
  ON responsaveis FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê seu próprio perfil"
  ON responsaveis FOR SELECT
  USING (user_id = auth.uid());


-- ============================================================
-- POLÍTICAS: aluno_responsavel
-- ============================================================
CREATE POLICY "Vínculos da minha cantina"
  ON aluno_responsavel FOR ALL
  USING (
    aluno_id IN (SELECT id FROM alunos WHERE cantina_id = minha_cantina_id())
  );


-- ============================================================
-- POLÍTICAS: contas
-- ============================================================
CREATE POLICY "Contas da minha cantina"
  ON contas FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê contas dos filhos"
  ON contas FOR SELECT
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: categorias e produtos
-- ============================================================
CREATE POLICY "Categorias da minha cantina"
  ON categorias FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Produtos da minha cantina"
  ON produtos FOR ALL
  USING (cantina_id = minha_cantina_id());

-- Responsável pode ver produtos (para exibir no app dos pais)
CREATE POLICY "Responsável vê produtos"
  ON produtos FOR SELECT
  USING (
    cantina_id IN (
      SELECT c.cantina_id FROM contas c
      JOIN aluno_responsavel ar ON ar.aluno_id = c.aluno_id
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: pedidos
-- ============================================================
CREATE POLICY "Pedidos da minha cantina"
  ON pedidos FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê pedidos dos filhos"
  ON pedidos FOR SELECT
  USING (
    aluno_id IN (
      SELECT ar.aluno_id FROM aluno_responsavel ar
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: itens_pedido
-- ============================================================
CREATE POLICY "Itens de pedidos da minha cantina"
  ON itens_pedido FOR ALL
  USING (
    pedido_id IN (SELECT id FROM pedidos WHERE cantina_id = minha_cantina_id())
  );

CREATE POLICY "Responsável vê itens dos filhos"
  ON itens_pedido FOR SELECT
  USING (
    pedido_id IN (
      SELECT p.id FROM pedidos p
      JOIN aluno_responsavel ar ON ar.aluno_id = p.aluno_id
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: transacoes
-- ============================================================
CREATE POLICY "Transações da minha cantina"
  ON transacoes FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê transações dos filhos"
  ON transacoes FOR SELECT
  USING (
    conta_id IN (
      SELECT c.id FROM contas c
      JOIN aluno_responsavel ar ON ar.aluno_id = c.aluno_id
      WHERE ar.responsavel_id = meu_responsavel_id()
    )
  );


-- ============================================================
-- POLÍTICAS: cobranças
-- ============================================================
CREATE POLICY "Cobranças da minha cantina"
  ON cobrancas FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê suas cobranças"
  ON cobrancas FOR SELECT
  USING (responsavel_id = meu_responsavel_id());


-- ============================================================
-- POLÍTICAS: pagamentos
-- ============================================================
CREATE POLICY "Pagamentos da minha cantina"
  ON pagamentos FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê seus pagamentos"
  ON pagamentos FOR SELECT
  USING (responsavel_id = meu_responsavel_id());


-- ============================================================
-- POLÍTICAS: notificacoes
-- ============================================================
CREATE POLICY "Notificações da minha cantina"
  ON notificacoes FOR ALL
  USING (cantina_id = minha_cantina_id());

CREATE POLICY "Responsável vê suas notificações"
  ON notificacoes FOR SELECT
  USING (responsavel_id = meu_responsavel_id());


-- ============================================================
-- SUPABASE REALTIME
-- Habilita escuta em tempo real nas tabelas principais
-- (para o app dos pais receber atualização instantânea)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE transacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE contas;
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE cobrancas;


-- ============================================================
-- DADOS INICIAIS DE EXEMPLO (opcional — remova se não quiser)
-- Útil para testar o sistema logo após a instalação
-- ============================================================

-- Descomente o bloco abaixo para inserir dados de teste:

/*
INSERT INTO cantinas (nome, escola, cidade, estado, email, plano, assinatura)
VALUES ('Cantina Exemplo', 'Escola Municipal Centro', 'São Paulo', 'SP', 'cantina@exemplo.com', 'pro', 'ativa');

-- Após criar o usuário no Auth, vincule ao perfil:
-- INSERT INTO perfis (id, cantina_id, nome, role)
-- VALUES ('<UUID_DO_AUTH_USER>', '<UUID_DA_CANTINA>', 'Dono da Cantina', 'admin');
*/


-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
-- Próximos passos após executar este arquivo:
--   1. Crie seu usuário em Authentication > Users no Supabase
--   2. Insira sua cantina na tabela `cantinas` (com chave Pix e WhatsApp)
--   3. Vincule o usuário ao perfil na tabela `perfis`
--   4. Cadastre turmas, alunos, responsáveis (com ciclo de cobrança)
--   5. Para enviar cobrança: SELECT fn_gerar_link_cobranca('<id>');
--      → retorna o link wa.me — basta clicar para abrir o WhatsApp
--   6. Ao receber o Pix, confirme manualmente na tabela `pagamentos`
--      (UPDATE pagamentos SET status='confirmado' WHERE id='<id>')
--      → o saldo do aluno é creditado automaticamente
-- ============================================================
