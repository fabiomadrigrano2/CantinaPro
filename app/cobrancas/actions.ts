"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function marcarCiclosComoPagos({
  alunoId,
  ciclos,
  formaPagamento,
}: {
  alunoId: string;
  ciclos: Array<{
    semanaInicio: string;
    semanaFim: string;
    total: number;
    cicloId: string | null;
  }>;
  formaPagamento: string;
}): Promise<{ error?: string }> {
  if (ciclos.length === 0) return {};
  const supabase = createAdminClient();

  for (const ciclo of ciclos) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cicloError } = await (supabase as any)
      .from("ciclos_cobranca")
      .upsert(
        {
          cantina_id: CANTINA_ID,
          aluno_id: alunoId,
          semana_inicio: ciclo.semanaInicio,
          semana_fim: ciclo.semanaFim,
          total: ciclo.total,
          status: "cobrado",
          forma_pagamento: formaPagamento,
        },
        { onConflict: "cantina_id,aluno_id,semana_inicio" }
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (cicloError) return { error: (cicloError as any).message };
  }

  const totalPago = ciclos.reduce((s, c) => s + c.total, 0);

  const { data: aluno, error: alunoError } = await supabase
    .from("alunos")
    .select("saldo")
    .eq("id", alunoId)
    .single();

  if (alunoError || !aluno) return { error: "Aluno não encontrado" };

  const novoSaldo = Math.round(((aluno.saldo ?? 0) + totalPago) * 100) / 100;

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
