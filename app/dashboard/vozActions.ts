"use server";

// Central de Voz do Dashboard. Antes de usar, execute no SQL Editor do Supabase:
// ver migration_central_voz.sql
//
// As ações em si reaproveitam as server actions existentes (registrarPagamentoFiado,
// quitarTudo, adicionarCredito). Aqui só se tira um retrato do estado antes e
// depois, para registrar em voz_acoes o necessário para desfazer.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { registrarPagamentoFiado, adicionarCredito } from "@/app/alunos/actions";
import { quitarTudo } from "@/app/cobrancas/actions";
import { carregarCiclosPendentes } from "@/lib/cobrancasDados";
import type { TipoAcaoVoz, IntencaoVoz, FormaPagamento } from "@/lib/centralVoz";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";
const ORIGEM = "(via Central de Voz)";

const r2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

async function usuarioLogado(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser();
  return user?.id ?? null;
}

// ── prévia (cartão de confirmação / consulta) ─────────────────────────────────

export type PreviaVoz = {
  alunoId: string;
  nome: string;
  turma: string | null;
  tipoConta: string | null;
  intencao: IntencaoVoz;
  valor: number;        // valor que será aplicado (na quitação, a dívida toda)
  saldoAntes: number;
  saldoDepois: number;
};

export async function previaAcaoVoz({
  alunoId,
  intencao,
  valor,
}: {
  alunoId: string;
  intencao: IntencaoVoz;
  valor: number | null;
}): Promise<{ previa?: PreviaVoz; error?: string }> {
  if (!(await usuarioLogado())) return { error: "Sessão expirada. Entre novamente." };

  const supabase = createAdminClient();
  const { data: aluno, error } = await supabase
    .from("alunos")
    .select("id, nome, turma, saldo, tipo_conta")
    .eq("id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .single();
  if (error || !aluno) return { error: "Aluno não encontrado." };

  const saldo = r2(Number(aluno.saldo ?? 0));
  const divida = r2(Math.max(0, -saldo));
  const base = {
    alunoId: aluno.id,
    nome: aluno.nome,
    turma: aluno.turma ?? null,
    tipoConta: (aluno as any).tipo_conta ?? null,
    intencao,
    saldoAntes: saldo,
  };

  if (intencao === "consulta") return { previa: { ...base, valor: 0, saldoDepois: saldo } };

  if (intencao === "quitar") {
    if (divida <= 0) return { error: `${aluno.nome} não tem dívida para quitar (saldo ${brl(saldo)}).` };
    return { previa: { ...base, valor: divida, saldoDepois: 0 } };
  }

  const v = r2(Number(valor ?? 0));
  if (!(v > 0)) return { error: "Valor inválido. Fale de novo." };

  if (intencao === "abater") {
    if (divida <= 0) return { error: `${aluno.nome} não tem dívida para abater (saldo ${brl(saldo)}).` };
    // registrarPagamentoFiado não deixa o saldo ficar positivo: o excedente
    // sumiria. Melhor recusar do que registrar um valor que não foi aplicado.
    if (v > divida + 0.005) {
      return {
        error: `O valor (${brl(v)}) é maior que a dívida de ${aluno.nome} (${brl(divida)}). ` +
               `Diga "quitar a conta" ou fale outro valor.`,
      };
    }
    return { previa: { ...base, valor: v, saldoDepois: r2(saldo + v) } };
  }

  return { previa: { ...base, valor: v, saldoDepois: r2(saldo + v) } };
}

// ── executar ──────────────────────────────────────────────────────────────────

type CicloRow = {
  semana_inicio: string;
  semana_fim: string;
  total: number;
  status: string;
  forma_pagamento: string | null;
};

async function retrato(alunoId: string) {
  const supabase = createAdminClient();
  const [{ data: aluno }, { data: conta }, { data: ciclos }] = await Promise.all([
    supabase.from("alunos").select("saldo, conta_paga").eq("id", alunoId).single(),
    supabase.from("contas").select("saldo").eq("aluno_id", alunoId).eq("cantina_id", CANTINA_ID).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("ciclos_cobranca")
      .select("semana_inicio, semana_fim, total, status, forma_pagamento")
      .eq("cantina_id", CANTINA_ID)
      .eq("aluno_id", alunoId),
  ]);
  return {
    saldo: aluno ? r2(Number(aluno.saldo ?? 0)) : null,
    contaPaga: (aluno as any)?.conta_paga ?? null,
    contaSaldo: conta ? r2(Number(conta.saldo ?? 0)) : null,
    ciclos: new Map<string, CicloRow>(((ciclos ?? []) as CicloRow[]).map((c) => [c.semana_inicio, c])),
  };
}

export type ResultadoExecucaoVoz = {
  error?: string;
  acaoId?: string;
  saldoDepois?: number;
  aviso?: string;
};

export async function executarAcaoVoz({
  alunoId,
  tipo,
  valor,
  formaPagamento,
  saldoEsperado,
  textoFalado,
}: {
  alunoId: string;
  tipo: TipoAcaoVoz;
  valor: number;
  formaPagamento: FormaPagamento;
  saldoEsperado: number;
  textoFalado: string;
}): Promise<ResultadoExecucaoVoz> {
  const usuarioId = await usuarioLogado();
  if (!usuarioId) return { error: "Sessão expirada. Entre novamente." };

  const antes = await retrato(alunoId);
  if (antes.saldo === null) return { error: "Aluno não encontrado." };
  // O cartão mostrou um "saldo antes"; se mudou nesse meio-tempo (uma venda,
  // outra tela), a conta mostrada já não vale.
  if (Math.abs(antes.saldo - saldoEsperado) > 0.005) {
    return { error: "O saldo do aluno mudou desde a conferência. Fale o comando de novo." };
  }

  let resultado: { error?: string; pagamentoId?: string | null };
  let valorAplicado = r2(valor);

  if (tipo === "abater") {
    resultado = await registrarPagamentoFiado({
      alunoId,
      valor: valorAplicado,
      formaPagamento,
      observacao: `Pagamento recebido - ${brl(valorAplicado)} ${ORIGEM}`,
    });
  } else if (tipo === "credito") {
    resultado = await adicionarCredito({
      alunoId,
      valor: valorAplicado,
      formaPagamento,
      observacao: `Recarga de crédito - ${brl(valorAplicado)} ${ORIGEM}`,
    });
  } else {
    valorAplicado = r2(Math.max(0, -antes.saldo));
    const pendentes = (await carregarCiclosPendentes([alunoId]))[alunoId] ?? [];
    resultado = await quitarTudo({
      alunoId,
      ciclos: pendentes.map((c) => ({
        semanaInicio: c.semana_inicio,
        semanaFim: c.semana_fim,
        total: c.total,
      })),
      formaPagamento,
      observacao: ORIGEM,
    });
  }

  if (resultado.error) return { error: resultado.error };

  const depois = await retrato(alunoId);

  // Ciclos criados ou alterados pela ação, como estavam antes
  const ciclosAntes: Array<Record<string, unknown>> = [];
  depois.ciclos.forEach((c, semana) => {
    const anterior = antes.ciclos.get(semana);
    const mudou =
      !anterior ||
      anterior.status !== c.status ||
      anterior.forma_pagamento !== c.forma_pagamento ||
      Number(anterior.total) !== Number(c.total);
    if (!mudou) return;
    ciclosAntes.push(
      anterior
        ? {
            semana_inicio: semana,
            existia: true,
            status: anterior.status,
            forma_pagamento: anterior.forma_pagamento,
            total: Number(anterior.total),
          }
        : { semana_inicio: semana, existia: false }
    );
  });

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: acao, error: logError } = await (supabase as any)
    .from("voz_acoes")
    .insert({
      cantina_id: CANTINA_ID,
      aluno_id: alunoId,
      tipo,
      valor: valorAplicado,
      forma_pagamento: formaPagamento,
      texto_falado: textoFalado.slice(0, 500),
      saldo_antes: antes.saldo,
      saldo_depois: depois.saldo ?? 0,
      conta_paga_antes: antes.contaPaga,
      conta_saldo_antes: antes.contaSaldo,
      conta_saldo_depois: depois.contaSaldo,
      ciclos_antes: ciclosAntes,
      pagamento_id: resultado.pagamentoId ?? null,
      usuario_id: usuarioId,
    })
    .select("id")
    .single();

  revalidatePath("/dashboard");
  revalidatePath("/alunos");
  revalidatePath("/cobrancas");

  if (logError || !acao) {
    console.error("[central-voz] ação feita, mas falhou o registro:", logError?.message);
    return {
      saldoDepois: depois.saldo ?? undefined,
      aviso: "A ação foi feita, mas não foi possível registrá-la para desfazer. " +
             "Se precisar corrigir, use a tela de Alunos.",
    };
  }

  return { acaoId: acao.id as string, saldoDepois: depois.saldo ?? undefined };
}

// ── desfazer ──────────────────────────────────────────────────────────────────

export async function desfazerAcaoVoz(
  acaoId: string
): Promise<{ ok?: boolean; error?: string; conflito?: string }> {
  const usuarioId = await usuarioLogado();
  if (!usuarioId) return { error: "Sessão expirada. Entre novamente." };

  const supabase = createAdminClient();
  // Tudo numa transação no banco (ver desfazer_acao_voz em migration_central_voz.sql)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("desfazer_acao_voz", {
    p_acao_id: acaoId,
    p_usuario: usuarioId,
  });
  if (error) return { error: error.message };

  const r = (data ?? {}) as { ok?: boolean; erro?: string; conflito?: string };
  if (r.conflito) return { conflito: r.conflito };
  if (r.erro) return { error: r.erro };

  revalidatePath("/dashboard");
  revalidatePath("/alunos");
  revalidatePath("/cobrancas");
  return { ok: true };
}

// ── últimas ações ─────────────────────────────────────────────────────────────

export type AcaoVozRecente = {
  id: string;
  alunoId: string;
  nome: string;
  tipo: TipoAcaoVoz;
  valor: number;
  saldoAntes: number;
  saldoDepois: number;
  formaPagamento: string | null;
  criadoEm: string;
  desfeitoEm: string | null;
};

export async function listarAcoesVoz(): Promise<{ acoes: AcaoVozRecente[]; error?: string }> {
  if (!(await usuarioLogado())) return { acoes: [], error: "Sessão expirada." };

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("voz_acoes")
    .select("id, aluno_id, tipo, valor, saldo_antes, saldo_depois, forma_pagamento, criado_em, desfeito_em")
    .eq("cantina_id", CANTINA_ID)
    .order("criado_em", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[central-voz] falha ao listar ações:", error.message);
    return { acoes: [], error: "Não foi possível carregar as últimas ações." };
  }

  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.map((r) => r.aluno_id as string)));
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: alunos } = await supabase.from("alunos").select("id, nome").in("id", ids);
    for (const a of alunos ?? []) nomes.set(a.id, a.nome);
  }

  return {
    acoes: rows.map((r) => ({
      id: r.id,
      alunoId: r.aluno_id,
      nome: nomes.get(r.aluno_id) ?? "—",
      tipo: r.tipo,
      valor: Number(r.valor),
      saldoAntes: Number(r.saldo_antes),
      saldoDepois: Number(r.saldo_depois),
      formaPagamento: r.forma_pagamento ?? null,
      criadoEm: r.criado_em,
      desfeitoEm: r.desfeito_em ?? null,
    })),
  };
}
