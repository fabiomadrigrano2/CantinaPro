"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { salvarHistoricoPagamento } from "@/lib/pagamentos";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export type ItemExtrato = { nome_produto: string; quantidade: number };
export type PedidoExtrato = { criado_em: string; total: number; itens: ItemExtrato[] };

// Busca pedidos confirmados dos últimos 65 dias — intervalo fixo que cobre
// com folga os 4 filtros de período do Extrato (semana atual, últimos 30
// dias, mês atual e mês anterior inteiro, mesmo no pior caso de dois meses
// de 31 dias seguidos).
export async function buscarExtratoAluno(
  alunoId: string
): Promise<{ pedidos?: PedidoExtrato[]; error?: string }> {
  const supabase = createAdminClient();

  const desde = new Date();
  desde.setDate(desde.getDate() - 65);

  const { data, error } = await (supabase as any)
    .from("pedidos")
    .select("criado_em, total, itens_pedido ( nome_produto, quantidade )")
    .eq("cantina_id", CANTINA_ID)
    .eq("aluno_id", alunoId)
    .eq("status", "confirmado")
    .gte("criado_em", desde.toISOString())
    .order("criado_em", { ascending: true });

  if (error) return { error: error.message };

  const pedidos: PedidoExtrato[] = (data ?? []).map((p: any) => ({
    criado_em: p.criado_em,
    total: p.total,
    itens: (p.itens_pedido ?? []).map((i: any) => ({
      nome_produto: i.nome_produto,
      quantidade: i.quantidade,
    })),
  }));

  return { pedidos };
}

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

  const diaMes = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
  const periodos = [...ciclos]
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio))
    .map((c) => `${diaMes(c.semanaInicio)} a ${diaMes(c.semanaFim)}`);
  await salvarHistoricoPagamento({
    alunoId,
    valor: Math.round(totalPago * 100) / 100,
    formaPagamento,
    tipo: "fiado",
    descricao: `Pagamento ${periodos.length > 1 ? "semanas" : "semana"} ${periodos.join(", ")}`,
  });

  revalidatePath("/cobrancas");
  return {};
}
