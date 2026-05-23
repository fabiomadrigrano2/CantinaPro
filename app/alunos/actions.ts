"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID_TEMP = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function createAluno(data: {
  nome: string;
  turma: string;
  tipo_conta: string;
  saldo_inicial: number;
}) {
  const supabase = createAdminClient();
  const cantina_id = CANTINA_ID_TEMP;

  // Insere o aluno com turma como texto direto (sem FK para tabela turmas)
  const { data: aluno, error: alunoError } = await supabase
    .from("alunos")
    .insert({
      cantina_id,
      nome:  data.nome.trim(),
      turma: data.turma.trim() || null,
    })
    .select("id")
    .single();

  if (alunoError) return { error: alunoError.message };

  // Insere a conta
  const { error: contaError } = await supabase
    .from("contas")
    .insert({
      cantina_id,
      aluno_id: aluno.id,
      tipo:  data.tipo_conta,
      saldo: data.saldo_inicial,
    });

  if (contaError) return { error: contaError.message };

  revalidatePath("/alunos");
  return { success: true };
}
