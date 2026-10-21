import { createClient } from "@/lib/supabase/server";
import type { CicloSemana } from "@/types/cobrancas";
import type { Devedor } from "@/components/cobrancas/CobrancasList";

// Carga de dados compartilhada entre a tela de Cobranças e o Resumão da Semana
// aberto pelo Dashboard.

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

// Semanas em horário de Brasília (UTC-3 fixo, mesma premissa do Extrato).
// O servidor da Vercel roda em UTC, então getDay()/setHours() locais cortavam
// a semana às 21h de domingo (BRT) em vez da meia-noite.
function toBRDateStr(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function addDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().split("T")[0];
}

// Segunda-feira (YYYY-MM-DD) da semana BR que contém a data
function getWeekStartBR(date: Date): string {
  const ymd = toBRDateStr(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sab
  return addDias(ymd, day === 0 ? -6 : 1 - day);
}

// Soma de todos os pedidos confirmados da cantina desde um instante (qualquer
// aluno ou venda avulsa) — mesmo critério das "Vendas hoje" do Dashboard.
// Paginado pelo mesmo limite de 1000 linhas do PostgREST.
async function somarPedidosDesde(
  supabase: ReturnType<typeof createClient>,
  cantinaId: string,
  desdeISO: string
): Promise<number> {
  const PAGE_SIZE = 1000;
  let soma = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pedidos")
      .select("total")
      .eq("cantina_id", cantinaId)
      .eq("status", "confirmado")
      .gte("criado_em", desdeISO)
      .order("criado_em", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    soma += (data as any[]).reduce((s, p) => s + (p.total ?? 0), 0);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Math.round(soma * 100) / 100;
}

type PedidoResumo = { aluno_id: string; total: number; criado_em: string };

// Busca todos os pedidos confirmados do período, paginando com .range() —
// o Supabase/PostgREST limita cada resposta a no máximo 1000 linhas, e com
// muitos devedores ativos o total de pedidos em 90 dias facilmente ultrapassa
// isso. Um único .limit(1000) ordenado por criado_em ascendente descartava
// silenciosamente os pedidos mais recentes (ex.: a semana atual inteira
// desaparecia da tela de Cobranças assim que o total passava de 1000).
async function fetchPedidosConfirmados(
  supabase: ReturnType<typeof createClient>,
  cantinaId: string,
  alunoIds: string[],
  desde: Date
): Promise<PedidoResumo[]> {
  const PAGE_SIZE = 1000;
  const todos: PedidoResumo[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pedidos")
      .select("aluno_id, total, criado_em")
      .eq("cantina_id", cantinaId)
      .eq("status", "confirmado")
      .in("aluno_id", alunoIds)
      .gte("criado_em", desde.toISOString())
      .order("criado_em", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    todos.push(...(data as any as PedidoResumo[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return todos;
}

export type AlunoSemCredito = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  telefone_responsavel: string | null;
};

export type DadosCobrancas = {
  devedores: Devedor[];
  semCredito: AlunoSemCredito[];
  alunosSemanais: Devedor[];
  ciclosSemanaisPorAluno: Record<string, CicloSemana[]>;
  consumoSemana: number;
};

export async function carregarDadosCobrancas(): Promise<DadosCobrancas> {
  const supabase = createClient();

  const [{ data: devedores }, { data: semCredito }, { data: alunosSemanais }] = await Promise.all([
    // Devedores: fiado (sempre devendo) + crédito com saldo negativo (estouraram
    // o pré-pago). Ambos têm extrato semanal e cobrança via WhatsApp iguais.
    supabase
      .from("alunos")
      .select("id, nome, turma, saldo, tipo_conta, ciclo_cobranca, dia_cobranca, telefone_responsavel, nome_responsavel")
      .eq("cantina_id", CANTINA_ID)
      .in("tipo_conta", ["fiado", "credito"])
      .eq("ativo", true)
      .lt("saldo", 0)
      .order("saldo"),
    // Crédito com saldo exatamente zerado: só precisa de aviso para recarregar,
    // não de cobrança (saldo negativo de crédito já aparece em devedores acima).
    supabase
      .from("alunos")
      .select("id, nome, turma, saldo, telefone_responsavel")
      .eq("cantina_id", CANTINA_ID)
      .eq("tipo_conta", "credito")
      .eq("ativo", true)
      .eq("saldo", 0)
      .order("nome"),
    // Todos os semanais ativos, devendo ou não, para o Resumão da Semana
    supabase
      .from("alunos")
      .select("id, nome, turma, saldo, tipo_conta, ciclo_cobranca, dia_cobranca, telefone_responsavel, nome_responsavel")
      .eq("cantina_id", CANTINA_ID)
      .eq("ciclo_cobranca", "semanal")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const alunoIds = (devedores ?? []).map((a: any) => a.id as string);

  const semanaAtualStr = getWeekStartBR(new Date());
  // Segunda 00:00 em Brasília = 03:00 UTC
  const consumoSemanaPromise = somarPedidosDesde(supabase, CANTINA_ID, `${semanaAtualStr}T03:00:00.000Z`);

  const ciclosSemanaisPorAluno = await carregarCiclosPendentes(alunoIds, supabase);

  return {
    devedores: (devedores as any) ?? [],
    semCredito: (semCredito as any) ?? [],
    alunosSemanais: (alunosSemanais as any) ?? [],
    ciclosSemanaisPorAluno,
    consumoSemana: await consumoSemanaPromise,
  };
}

// Semanas com consumo (90 dias) ainda não cobradas nem pagas, por aluno — o
// que a tela de Cobranças manda para quitarTudo(). Também usado pela Central
// de Voz para quitar a conta de um aluno.
export async function carregarCiclosPendentes(
  alunoIds: string[],
  supabase: ReturnType<typeof createClient> = createClient()
): Promise<Record<string, CicloSemana[]>> {
  const semanaAtualStr = getWeekStartBR(new Date());
  const ciclosSemanaisPorAluno: Record<string, CicloSemana[]> = {};

  if (alunoIds.length > 0) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [pedidos, { data: ciclosDb }] = await Promise.all([
      fetchPedidosConfirmados(supabase, CANTINA_ID, alunoIds, ninetyDaysAgo),
      supabase
        .from("ciclos_cobranca")
        .select("id, aluno_id, semana_inicio, status")
        .eq("cantina_id", CANTINA_ID)
        .in("aluno_id", alunoIds),
    ]);

    // Agrupa pedidos por aluno + semana
    const semanasPorAluno: Record<
      string,
      Record<string, { total: number; semana_fim: string }>
    > = {};

    for (const p of pedidos ?? []) {
      const aid = (p as any).aluno_id as string;
      const inicioStr = getWeekStartBR(new Date((p as any).criado_em));
      const fimStr = addDias(inicioStr, 6);

      if (!semanasPorAluno[aid]) semanasPorAluno[aid] = {};
      if (!semanasPorAluno[aid][inicioStr]) {
        semanasPorAluno[aid][inicioStr] = { total: 0, semana_fim: fimStr };
      }
      semanasPorAluno[aid][inicioStr].total += (p as any).total;
    }

    // Mapa de ciclos existentes por aluno
    const cicloMapPorAluno: Record<string, Map<string, any>> = {};
    for (const c of ciclosDb ?? []) {
      const aid = (c as any).aluno_id as string;
      if (!cicloMapPorAluno[aid]) cicloMapPorAluno[aid] = new Map();
      cicloMapPorAluno[aid].set((c as any).semana_inicio, c);
    }

    for (const alunoId of alunoIds) {
      const semanas = semanasPorAluno[alunoId] ?? {};
      const cicloMap = cicloMapPorAluno[alunoId] ?? new Map();

      ciclosSemanaisPorAluno[alunoId] = Object.entries(semanas)
        .map(([inicioStr, { total, semana_fim }]) => {
          const cicloExistente = cicloMap.get(inicioStr);
          return {
            semana_inicio: inicioStr,
            semana_fim,
            total: Math.round(total * 100) / 100,
            status: (cicloExistente?.status ?? "aberto") as CicloSemana["status"],
            ciclo_id: cicloExistente?.id ?? null,
            is_current: inicioStr === semanaAtualStr,
          };
        })
        .filter((c) => c.status !== "cobrado" && c.status !== "pago")
        .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
    }
  }

  return ciclosSemanaisPorAluno;
}
