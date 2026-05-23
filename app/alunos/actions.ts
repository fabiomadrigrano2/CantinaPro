"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

type ContaTipo = Database["public"]["Enums"]["conta_tipo"];

const CANTINA_ID_TEMP = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function addResponsavel(
  alunoId: string,
  data: { nome: string; email: string | null; parentesco: string | null }
): Promise<{ id: string; nome: string; email: string | null; parentesco: string | null } | { error: string }> {
  const supabase = createClient();

  const { data: resp, error: respError } = await supabase
    .from("responsaveis")
    .insert({ cantina_id: CANTINA_ID_TEMP, nome: data.nome, email: data.email })
    .select("id, nome, email")
    .single();

  if (respError) return { error: respError.message };

  const { error: linkError } = await supabase
    .from("aluno_responsavel")
    .insert({ aluno_id: alunoId, responsavel_id: resp.id, parentesco: data.parentesco });

  if (linkError) return { error: linkError.message };

  return { ...resp, parentesco: data.parentesco };
}

export async function removeResponsavel(
  alunoId: string,
  responsavelId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("aluno_responsavel")
    .delete()
    .eq("aluno_id", alunoId)
    .eq("responsavel_id", responsavelId);
  return error ? { error: error.message } : {};
}

export async function createAluno(data: {
  nome: string;
  turma: string;
  tipo_conta: string;
  saldo_inicial: number;
}) {
  const supabase = createClient();
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
      tipo:  data.tipo_conta as ContaTipo,
      saldo: data.saldo_inicial,
    });

  if (contaError) return { error: contaError.message };

  revalidatePath("/alunos");
  return { success: true };
}
