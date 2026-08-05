"use server";

// Antes de usar o cancelamento, execute no SQL Editor do Supabase:
// ver migration_cancelamento_pedidos.sql

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dateBR(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export async function cancelarPedido(pedidoId: string): Promise<{ error?: string }> {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: "Usuário não autenticado." };

  const supabase = createAdminClient();

  const { data: pedido, error: pedidoError } = await supabase
    .from("pedidos")
    .select("id, cantina_id, aluno_id, status, total, criado_em")
    .eq("id", pedidoId)
    .single();

  if (pedidoError || !pedido) return { error: "Pedido não encontrado." };
  if (pedido.cantina_id !== CANTINA_ID) return { error: "Pedido não encontrado." };
  if (pedido.status === "cancelado") return { error: "Este pedido já está cancelado." };
  if (pedido.status !== "confirmado") return { error: "Apenas pedidos confirmados podem ser cancelados." };
  if (!pedido.criado_em || dateBR(pedido.criado_em) !== todayBR()) {
    return { error: "Só é possível cancelar vendas do mesmo dia." };
  }

  const [{ data: aluno, error: alunoError }, { data: conta }, { data: perfil }] = await Promise.all([
    supabase.from("alunos").select("saldo, tipo_conta").eq("id", pedido.aluno_id).single(),
    supabase.from("contas").select("id, saldo").eq("aluno_id", pedido.aluno_id).maybeSingle(),
    supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle(),
  ]);

  if (alunoError || !aluno) return { error: "Aluno não encontrado." };

  const canceladoPorNome = perfil?.nome || user.email || "Usuário desconhecido";
  const novoSaldo = Math.round(((aluno.saldo ?? 0) + pedido.total) * 100) / 100;

  const alunoUpdate: Record<string, unknown> = { saldo: novoSaldo };
  if (aluno.tipo_conta === "fiado") alunoUpdate.conta_paga = novoSaldo >= 0;

  const { error: saldoError } = await (supabase as any)
    .from("alunos")
    .update(alunoUpdate)
    .eq("id", pedido.aluno_id);

  if (saldoError) return { error: saldoError.message };

  if (conta) {
    await supabase
      .from("contas")
      .update({ saldo: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq("id", conta.id);

    await supabase.from("transacoes").insert({
      cantina_id: CANTINA_ID,
      conta_id: conta.id,
      pedido_id: pedido.id,
      tipo: "estorno",
      valor: pedido.total,
      saldo_apos: novoSaldo,
      descricao: `Estorno de venda cancelada por ${canceladoPorNome}`,
    });
  }

  const { error: cancelError } = await supabase
    .from("pedidos")
    .update({
      status: "cancelado",
      cancelado_por: user.id,
      cancelado_por_nome: canceladoPorNome,
      cancelado_em: new Date().toISOString(),
    })
    .eq("id", pedido.id);

  if (cancelError) return { error: cancelError.message };

  revalidatePath("/historico");
  return {};
}
