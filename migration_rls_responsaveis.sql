-- ============================================================
-- PASSO 1 — DIAGNÓSTICO (rode primeiro e veja o resultado)
-- ============================================================
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('responsaveis', 'aluno_responsavel')
ORDER BY tablename, policyname;

-- ============================================================
-- PASSO 2 — CORREÇÃO
-- Cobre os dois conjuntos de nomes possíveis (ambos os schemas)
-- ============================================================

-- responsaveis: drop de qualquer variante de nome existente
DROP POLICY IF EXISTS "responsaveis_cantina"          ON responsaveis;
DROP POLICY IF EXISTS "Responsáveis da minha cantina" ON responsaveis;

-- Recria com WITH CHECK explícito para INSERT funcionar
CREATE POLICY "responsaveis_cantina" ON responsaveis
  FOR ALL
  USING      (cantina_id = minha_cantina_id())
  WITH CHECK (cantina_id = minha_cantina_id());

-- aluno_responsavel: drop de qualquer variante de nome existente
DROP POLICY IF EXISTS "aluno_responsavel_cantina" ON aluno_responsavel;
DROP POLICY IF EXISTS "Vínculos da minha cantina" ON aluno_responsavel;

-- Recria com WITH CHECK explícito
CREATE POLICY "aluno_responsavel_cantina" ON aluno_responsavel
  FOR ALL
  USING (
    aluno_id IN (SELECT id FROM alunos WHERE cantina_id = minha_cantina_id())
  )
  WITH CHECK (
    aluno_id IN (SELECT id FROM alunos WHERE cantina_id = minha_cantina_id())
  );

-- ============================================================
-- PASSO 3 — VERIFICAÇÃO (rode após o passo 2)
-- Confirma que minha_cantina_id() retorna valor para o seu usuário
-- (execute logado como o usuário da cantina, não como service_role)
-- ============================================================
SELECT minha_cantina_id();
