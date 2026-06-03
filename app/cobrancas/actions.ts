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
          status: "pago",
          forma_pagamento: formaPagamento,
        },
        { onConflict: "cantina_id,aluno_id,semana_inicio" }
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (cicloError) return { error: (cicloError as any).message };
  }

  const totalPago = ciclos.reduce((s, c) => s + c.total, 0);

  const [{ data: aluno, error: alunoError }, { data: conta, error: contaError }] =
    await Promise.all([
      supabase.from("alunos").select("saldo").eq("id", alunoId).single(),
      supabase.from("contas").select("saldo").eq("aluno_id", alunoId).single(),
    ]);

  if (alunoError || !aluno) return { error: "Aluno não encontrado" };
  if (contaError || !conta) return { error: "Conta não encontrada" };

  const saldoAluno = Number(aluno.saldo ?? 0);
  const saldoConta = Number(conta.saldo ?? 0);

  // Limita o crédito ao valor da dívida: nunca deixa o saldo ficar positivo
  const devidoAluno = Math.max(0, -saldoAluno);
  const devidoConta = Math.max(0, -saldoConta);
  const creditoAluno = Math.min(totalPago, devidoAluno);
  const creditoConta = Math.min(totalPago, devidoConta);

  const novoSaldoAluno = Math.round((saldoAluno + creditoAluno) * 100) / 100;
  const novoSaldoConta = Math.round((saldoConta + creditoConta) * 100) / 100;

  const { error: errAluno } = await supabase
    .from("alunos")
    .update({ saldo: novoSaldoAluno })
    .eq("id", alunoId);
  if (errAluno) return { error: errAluno.message };

  await supabase
    .from("contas")
    .update({ saldo: novoSaldoConta, atualizado_em: new Date().toISOString() })
    .eq("aluno_id", alunoId);

  revalidatePath("/cobrancas");
  return {};
}
