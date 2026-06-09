"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

type ContaTipo = Database["public"]["Enums"]["conta_tipo"];

const CANTINA_ID_TEMP = "c7301d8b-890b-4775-986e-bb88979326f3";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function addResponsavel(
  alunoId: string,
  data: { nome: string; email: string | null; parentesco: string | null }
): Promise<{ id: string; nome: string; email: string | null; parentesco: string | null } | { error: string }> {
  const supabase = createAdminClient();

  // Reutiliza registro existente se o email já estiver cadastrado (evita duplicatas)
  let resp: { id: string; nome: string; email: string | null };

  if (data.email) {
    const { data: existing } = await supabase
      .from("responsaveis")
      .select("id, nome, email")
      .ilike("email", data.email)
      .limit(1)
      .maybeSingle();

    if (existing) {
      resp = existing;
    } else {
      const { data: created, error: createError } = await supabase
        .from("responsaveis")
        .insert({ cantina_id: CANTINA_ID_TEMP, nome: data.nome, email: data.email })
        .select("id, nome, email")
        .single();
      if (createError) return { error: createError.message };
      if (!created) return { error: "Falha ao criar responsável: nenhum registro retornado." };
      resp = created;
    }
  } else {
    // Sem email: sempre cria novo registro
    const { data: created, error: createError } = await supabase
      .from("responsaveis")
      .insert({ cantina_id: CANTINA_ID_TEMP, nome: data.nome, email: data.email })
      .select("id, nome, email")
      .single();
    if (createError) return { error: createError.message };
    if (!created) return { error: "Falha ao criar responsável: nenhum registro retornado." };
    resp = created;
  }

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
  const supabase = createAdminClient();
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
      tipo:  data.tipo_conta as ContaTipo,
      saldo: data.saldo_inicial,
    });

  if (contaError) return { error: contaError.message };

  revalidatePath("/alunos");
  return { success: true };
}

export async function registrarPagamentoFiado({
  alunoId,
  valor,
  formaPagamento,
  observacao,
}: {
  alunoId: string;
  valor: number;
  formaPagamento: string;
  observacao?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  const [{ data: aluno, error: alunoError }, { data: conta, error: contaError }] =
    await Promise.all([
      supabase.from("alunos").select("saldo").eq("id", alunoId).single(),
      supabase.from("contas").select("saldo").eq("aluno_id", alunoId).single(),
    ]);

  if (alunoError || !aluno) return { error: "Aluno não encontrado" };
  if (contaError || !conta) return { error: "Conta não encontrada" };

  const saldoAluno = Number(aluno.saldo ?? 0);
  const saldoConta = Number(conta.saldo ?? 0);

  // Busca pedidos (90 dias) e ciclos existentes em paralelo
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [{ data: pedidos }, { data: ciclosDb }] = await Promise.all([
    supabase
      .from("pedidos")
      .select("total, criado_em")
      .eq("cantina_id", CANTINA_ID_TEMP)
      .eq("aluno_id", alunoId)
      .eq("status", "confirmado")
      .gte("criado_em", ninetyDaysAgo.toISOString())
      .order("criado_em", { ascending: true })
      .limit(500),
    supabase
      .from("ciclos_cobranca")
      .select("id, semana_inicio, semana_fim, total, status")
      .eq("cantina_id", CANTINA_ID_TEMP)
      .eq("aluno_id", alunoId),
  ]);

  // Agrega totais por semana a partir dos pedidos
  const semanas: Record<string, { total: number; semana_fim: string }> = {};
  for (const p of pedidos ?? []) {
    const inicioDate = getWeekStart(new Date((p as any).criado_em));
    const fimDate = new Date(inicioDate);
    fimDate.setDate(inicioDate.getDate() + 6);
    const inicioStr = toDateStr(inicioDate);
    if (!semanas[inicioStr]) semanas[inicioStr] = { total: 0, semana_fim: toDateStr(fimDate) };
    semanas[inicioStr].total += (p as any).total;
  }

  // Mapa de ciclos do DB por semana_inicio
  const cicloMap = new Map<string, any>();
  for (const c of ciclosDb ?? []) {
    cicloMap.set((c as any).semana_inicio, c);
  }

  // Ciclos pendentes ordenados do mais antigo ao mais recente
  const pendentes = Object.entries(semanas)
    .map(([inicioStr, { total, semana_fim }]) => {
      const cicloExistente = cicloMap.get(inicioStr);
      return {
        semana_inicio: inicioStr,
        semana_fim,
        total: Math.round(total * 100) / 100,
        status: (cicloExistente?.status ?? "aberto") as string,
      };
    })
    .filter((c) => c.status !== "pago")
    .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));

  // Marca ciclos como pagos na ordem cronológica até o valor ser consumido
  let restante = valor;
  for (const ciclo of pendentes) {
    if (restante <= 0) break;
    if (restante < ciclo.total - 0.005) break; // pagamento não cobre este ciclo inteiro

    const { error: upsertError } = await (supabase as any)
      .from("ciclos_cobranca")
      .upsert(
        {
          cantina_id: CANTINA_ID_TEMP,
          aluno_id: alunoId,
          semana_inicio: ciclo.semana_inicio,
          semana_fim: ciclo.semana_fim,
          total: ciclo.total,
          status: "pago",
          forma_pagamento: formaPagamento,
        },
        { onConflict: "cantina_id,aluno_id,semana_inicio" }
      );
    if (upsertError) return { error: upsertError.message };

    restante -= ciclo.total;
  }

  // Atualiza saldo — nunca deixa o aluno com saldo positivo
  const devidoAluno = Math.max(0, -saldoAluno);
  const devidoConta = Math.max(0, -saldoConta);
  const creditoAluno = Math.min(valor, devidoAluno);
  const creditoConta = Math.min(valor, devidoConta);
  const novoSaldoAluno = Math.round((saldoAluno + creditoAluno) * 100) / 100;
  const novoSaldoConta = Math.round((saldoConta + creditoConta) * 100) / 100;
  const contaPaga = novoSaldoAluno >= 0;

  const { error: errAluno } = await supabase
    .from("alunos")
    .update({ saldo: novoSaldoAluno, conta_paga: contaPaga })
    .eq("id", alunoId);
  if (errAluno) return { error: errAluno.message };

  await supabase
    .from("contas")
    .update({ saldo: novoSaldoConta, atualizado_em: new Date().toISOString() })
    .eq("aluno_id", alunoId);

  const obs =
    observacao?.trim() ||
    `Pagamento recebido - R$ ${valor.toFixed(2).replace(".", ",")}`;
  await supabase.from("pagamentos").insert({
    cantina_id: CANTINA_ID_TEMP,
    aluno_id: alunoId,
    valor,
    forma_pagamento: formaPagamento,
    observacao: obs,
    tipo: "fiado",
  });

  revalidatePath("/alunos");
  revalidatePath("/cobrancas");
  return {};
}
