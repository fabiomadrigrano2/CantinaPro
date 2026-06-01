"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function marcarCicloComoCobrado({
  alunoId,
  semanaInicio,
  semanaFim,
  total,
  cicloId,
}: {
  alunoId: string;
  semanaInicio: string;
  semanaFim: string;
  total: number;
  cicloId: string | null;
}): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  // Upsert ciclos_cobranca — idempotente se já existe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: cicloError } = await (supabase as any)
    .from("ciclos_cobranca")
    .upsert(
      {
        cantina_id: CANTINA_ID,
        aluno_id: alunoId,
        semana_inicio: semanaInicio,
        semana_fim: semanaFim,
        total,
        status: "cobrado",
      },
      { onConflict: "cantina_id,aluno_id,semana_inicio" }
    );
  if (cicloError) return { error: (cicloError as any).message };

  // Creditar saldo do aluno
  const { data: aluno, error: alunoError } = await supabase
    .from("alunos")
    .select("saldo")
    .eq("id", alunoId)
    .single();

  if (alunoError || !aluno) return { error: "Aluno não encontrado" };

  const novoSaldo = Math.round(((aluno.saldo ?? 0) + total) * 100) / 100;

  await supabase
    .from("alunos")
    .update({ saldo: novoSaldo })
    .eq("id", alunoId);

  await supabase
    .from("contas")
    .update({ saldo: novoSaldo, atualizado_em: new Date().toISOString() })
    .eq("aluno_id", alunoId);

  revalidatePath("/cobrancas");
  return {};
}
