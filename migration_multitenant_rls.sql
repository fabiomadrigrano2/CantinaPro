-- ============================================================
-- Migração: auditoria multi-tenant das policies RLS
-- Execute no SQL Editor do Supabase (Database > SQL Editor),
-- um passo de cada vez, na ordem.
--
-- Regra: toda tabela com cantina_id só enxerga/grava linhas onde
-- cantina_id = minha_cantina_id() (cantina do perfil do usuário logado).
-- Nenhuma policy pode ter ID de cantina fixo nem USING (true).
-- ============================================================


-- ============================================================
-- PASSO 1 — DIAGNÓSTICO (somente leitura)
-- Policies com UUID literal ou liberadas para todos (true).
-- Anote o resultado: são essas que o PASSO 2 remove.
-- ============================================================
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
       qual       ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    OR with_check ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    OR qual       = 'true'
    OR with_check = 'true'
  )
ORDER BY tablename, policyname;


-- ============================================================
-- PASSO 2 — CORREÇÃO
-- ============================================================

-- 2.1 Funções de RLS com search_path fixo (boa prática para SECURITY DEFINER)
ALTER FUNCTION minha_cantina_id()   SET search_path = public;
ALTER FUNCTION meu_responsavel_id() SET search_path = public;

-- 2.2 Remove policies com ID de cantina fixo ou USING (true)
--     (ex.: as de fornecedores criadas com o ID literal, e as
--     "authenticated_access" de fechamentos_diarios e movimentacoes_caixa)
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
           qual       ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        OR with_check ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        OR qual       = 'true'
        OR with_check = 'true'
      )
  LOOP
    RAISE NOTICE 'Removendo policy "%" de %', p.policyname, p.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- 2.3 Garante RLS ligado + policy por minha_cantina_id() em TODA tabela
--     que tem coluna cantina_id. Tabelas que já têm uma policy com
--     minha_cantina_id() não são tocadas. perfis fica de fora: lá a
--     policy é só de leitura de propósito (ninguém edita perfil pelo app).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name   = c.table_name
     AND tb.table_type   = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'cantina_id'
      AND c.table_name  <> 'perfis'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = t
        AND qual LIKE '%minha_cantina_id()%'
    ) THEN
      RAISE NOTICE 'Criando policy "% por cantina"', t;
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (cantina_id = minha_cantina_id())
           WITH CHECK (cantina_id = minha_cantina_id())',
        t || ' por cantina', t
      );
    END IF;
  END LOOP;
END $$;

-- 2.4 Fotos de produtos: cada cantina só grava na própria pasta
--     (o app já salva em "<cantina_id>/arquivo.ext"). Leitura continua pública.
DROP POLICY IF EXISTS "Upload de fotos de produtos"   ON storage.objects;
DROP POLICY IF EXISTS "Atualizar fotos de produtos"   ON storage.objects;

CREATE POLICY "Upload de fotos de produtos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'produtos'
  AND (storage.foldername(name))[1] = public.minha_cantina_id()::text
);

CREATE POLICY "Atualizar fotos de produtos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'produtos'
  AND (storage.foldername(name))[1] = public.minha_cantina_id()::text
);


-- ============================================================
-- PASSO 3 — VERIFICAÇÃO (deve voltar vazio nas duas consultas)
-- ============================================================

-- 3.1 Tabelas com cantina_id sem RLS ou sem policy por minha_cantina_id()
SELECT c.table_name,
       cl.relrowsecurity AS rls_ligado
FROM information_schema.columns c
JOIN pg_class cl      ON cl.relname = c.table_name
JOIN pg_namespace ns  ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
WHERE c.table_schema = 'public'
  AND c.column_name  = 'cantina_id'
  AND cl.relkind     = 'r'
  AND (
       NOT cl.relrowsecurity
    OR NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public'
           AND p.tablename  = c.table_name
           AND p.qual LIKE '%minha_cantina_id()%'
       )
  );

-- 3.2 Nenhuma policy com ID fixo ou true
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
       qual       ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    OR with_check ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    OR qual       = 'true'
    OR with_check = 'true'
  );
