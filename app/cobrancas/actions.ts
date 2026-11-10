"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { salvarHistoricoPagamento } from "@/lib/pagamentos";
import { carregarDadosCobrancas, type DadosCobrancas } from "@/lib/cobrancasDados";
import { buscarCantinaInfo, getCantinaId } from "@/lib/cantina";
import type { CantinaInfo } from "@/lib/cantinaInfo";
import { YMD_RE, diaBR, diasNoIntervalo, somarDias } from "@/lib/dataBR";

const SEM_SESSAO = "Sessão expirada. Entre novamente.";

export type ItemExtrato = { nome_produto: string; quantidade: number; preco_unitario: number | null };
export type PedidoExtrato = { criado_em: string; total: number; itens: ItemExtrato[] };
export type PagamentoExtrato = { criado_em: string; valor: number; forma_pagamento: string | null };

export type ExtratoAluno = {
  pedidos: PedidoExtrato[];
  pagamentos: PagamentoExtrato[];
  // alunos.saldo hoje (negativo = em aberto), o mesmo da tela de Cobranças
  saldoAtual: number;
  cantina: CantinaInfo;
};

const MAX_DIAS_EXTRATO = 366;

// Pedidos e pagamentos confirmados (sem estornados, pendentes ou cancelados) do aluno entre inicio e
// fim, inclusive — dias "YYYY-MM-DD" em America/Sao_Paulo. A consulta pega um
// dia de folga em cada ponta (em UTC) e o corte exato é feito pelo dia em
// Brasília de cada registro.
export async function buscarExtratoAluno(
  alunoId: string,
  inicio: string,
  fim: string
): Promise<{ extrato?: ExtratoAluno; error?: string }> {
  if (!YMD_RE.test(inicio) || !YMD_RE.test(fim) || inicio > fim) {
    return { error: "Período inválido: a data inicial deve ser anterior ou igual à final." };
  }
  if (diasNoIntervalo(inicio, fim) > MAX_DIAS_EXTRATO) {
    return { error: `Escolha um período de até ${MAX_DIAS_EXTRATO} dias.` };
  }

  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
  const supabase = createAdminClient();

  const { data: aluno } = await supabase
    .from("alunos")
    .select("saldo")
    .eq("id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();
  if (!aluno) return { error: "Aluno não encontrado." };

  const desdeISO = `${somarDias(inicio, -1)}T00:00:00.000Z`;
  const ateISO   = `${somarDias(fim, 2)}T00:00:00.000Z`;
  const noPeriodo = (iso: string) => {
    const dia = diaBR(iso);
    return dia >= inicio && dia <= fim;
  };

  // Paginado pelo limite de 1000 linhas do PostgREST (períodos longos)
  const PAGE_SIZE = 1000;
  const pedidosDb: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select("criado_em, total, itens_pedido ( nome_produto, quantidade, preco_unitario )")
      .eq("cantina_id", CANTINA_ID)
      .eq("aluno_id", alunoId)
      .eq("status", "confirmado")
      .gte("criado_em", desdeISO)
      .lt("criado_em", ateISO)
      .order("criado_em", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { error: error.message };
    pedidosDb.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const [{ data: pagamentosDb, error: errPag }, cantina] = await Promise.all([
    (supabase as any)
      .from("pagamentos")
      .select("criado_em, valor, forma_pagamento")
      .eq("cantina_id", CANTINA_ID)
      .eq("aluno_id", alunoId)
      .eq("status", "confirmado")
      .gte("criado_em", desdeISO)
      .lt("criado_em", ateISO)
      .order("criado_em", { ascending: true }),
    buscarCantinaInfo(CANTINA_ID),
  ]);
  if (errPag) return { error: errPag.message };

  const pedidos: PedidoExtrato[] = pedidosDb
    .filter((p) => noPeriodo(p.criado_em))
    .map((p) => ({
      criado_em: p.criado_em,
      total: p.total,
      itens: (p.itens_pedido ?? []).map((i: any) => ({
        nome_produto: i.nome_produto,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario ?? null,
      })),
    }));

  const pagamentos: PagamentoExtrato[] = (pagamentosDb ?? [])
    .filter((p: any) => p.criado_em && noPeriodo(p.criado_em))
    .map((p: any) => ({
      criado_em: p.criado_em,
      valor: Number(p.valor) || 0,
      forma_pagamento: p.forma_pagamento ?? null,
    }));

  return { extrato: { pedidos, pagamentos, saldoAtual: Number(aluno.saldo) || 0, cantina } };
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
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
  const supabase = createAdminClient();

  // Valida o aluno antes de gravar qualquer ciclo
  const { data: alunoOk } = await supabase
    .from("alunos").select("id").eq("id", alunoId).eq("cantina_id", CANTINA_ID).maybeSingle();
  if (!alunoOk) return { error: "Aluno não encontrado" };

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
      supabase.from("alunos").select("saldo").eq("id", alunoId).eq("cantina_id", CANTINA_ID).single(),
      supabase.from("contas").select("saldo").eq("aluno_id", alunoId).eq("cantina_id", CANTINA_ID).single(),
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
    .eq("id", alunoId)
    .eq("cantina_id", CANTINA_ID);
  if (errAluno) return { error: errAluno.message };

  await supabase
    .from("contas")
    .update({ saldo: novoSaldoConta, atualizado_em: new Date().toISOString() })
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID);

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

// Quita toda a dívida do aluno: marca todos os ciclos pendentes como pagos,
// zera o saldo devedor (inclusive saldo anterior ao app) e registra um único
// pagamento no histórico. O valor vem do banco, não da tela.
export async function quitarTudo({
  alunoId,
  ciclos,
  formaPagamento,
  observacao,
}: {
  alunoId: string;
  ciclos: Array<{ semanaInicio: string; semanaFim: string; total: number }>;
  formaPagamento: string;
  observacao?: string;
}): Promise<{ error?: string; pagamentoId?: string | null }> {
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
  const supabase = createAdminClient();

  const [{ data: aluno, error: alunoError }, { data: conta }] = await Promise.all([
    supabase.from("alunos").select("saldo").eq("id", alunoId).eq("cantina_id", CANTINA_ID).single(),
    supabase.from("contas").select("saldo").eq("aluno_id", alunoId).eq("cantina_id", CANTINA_ID).maybeSingle(),
  ]);
  if (alunoError || !aluno) return { error: "Aluno não encontrado" };

  const saldoAluno = Number(aluno.saldo ?? 0);
  const valorQuitado = Math.round(Math.max(0, -saldoAluno) * 100) / 100;
  if (valorQuitado <= 0) return { error: "Este aluno não tem saldo devedor para quitar." };

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

  const { error: errAluno } = await supabase
    .from("alunos")
    .update({ saldo: 0, conta_paga: true })
    .eq("id", alunoId)
    .eq("cantina_id", CANTINA_ID);
  if (errAluno) return { error: errAluno.message };

  if (conta && Number(conta.saldo ?? 0) < 0) {
    await supabase
      .from("contas")
      .update({ saldo: 0, atualizado_em: new Date().toISOString() })
      .eq("aluno_id", alunoId)
      .eq("cantina_id", CANTINA_ID);
  }

  const pagamentoId = await salvarHistoricoPagamento({
    alunoId,
    valor: valorQuitado,
    formaPagamento,
    tipo: "fiado",
    descricao:
      `Quitação total - R$ ${valorQuitado.toFixed(2).replace(".", ",")}` +
      (observacao ? ` ${observacao}` : ""),
  });

  revalidatePath("/cobrancas");
  revalidatePath("/alunos");
  revalidatePath("/dashboard");
  return { pagamentoId };
}

// Dados do Resumão da Semana sob demanda — o Dashboard só carrega os 90 dias
// de pedidos quando o modal é aberto.
export async function buscarDadosResumao(): Promise<DadosCobrancas> {
  return carregarDadosCobrancas();
}
