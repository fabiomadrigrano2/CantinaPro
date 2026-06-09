import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import CobrancasList from "@/components/cobrancas/CobrancasList";
import type { CicloSemana } from "@/types/cobrancas";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
  const diff = day === 0 ? -6 : 1 - day; // deslocar para segunda
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default async function CobrancasPage() {
  const supabase = createClient();

  // 1. Busca alunos devedores (fiado, saldo negativo)
  const { data: devedoresRaw } = await supabase
    .from("alunos")
    .select("id, nome, turma, saldo, ciclo_cobranca, dia_cobranca, telefone_responsavel")
    .eq("cantina_id", CANTINA_ID)
    .eq("tipo_conta", "fiado")
    .eq("ativo", true)
    .lt("saldo", 0)
    .order("saldo");

  const alunoIdsRaw = (devedoresRaw ?? []).map((a: any) => a.id as string);

  // 2. Busca semCredito e responsáveis em paralelo
  const [{ data: semCredito }, { data: responsaveisRaw }] = await Promise.all([
    supabase
      .from("alunos")
      .select("id, nome, turma, saldo, telefone_responsavel")
      .eq("cantina_id", CANTINA_ID)
      .eq("tipo_conta", "credito")
      .eq("ativo", true)
      .lte("saldo", 0)
      .order("nome"),
    alunoIdsRaw.length > 0
      ? supabase
          .from("aluno_responsavel")
          .select("aluno_id, responsaveis(nome)")
          .in("aluno_id", alunoIdsRaw)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // 3. Monta mapa aluno_id → nome do primeiro responsável
  const respNomeMap = new Map<string, string>();
  for (const r of (responsaveisRaw ?? []) as any[]) {
    if (!respNomeMap.has(r.aluno_id) && r.responsaveis?.nome) {
      respNomeMap.set(r.aluno_id, r.responsaveis.nome);
    }
  }

  const devedores = (devedoresRaw ?? []).map((a: any) => ({
    ...a,
    nome_responsavel: respNomeMap.get(a.id) ?? null,
  }));

  const alunoIds = devedores.map((a: any) => a.id as string);

  let ciclosSemanaisPorAluno: Record<string, CicloSemana[]> = {};

  if (alunoIds.length > 0) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [{ data: pedidos }, { data: ciclosDb }] = await Promise.all([
      supabase
        .from("pedidos")
        .select("aluno_id, total, criado_em")
        .eq("cantina_id", CANTINA_ID)
        .eq("status", "confirmado")
        .in("aluno_id", alunoIds)
        .gte("criado_em", ninetyDaysAgo.toISOString())
        .order("criado_em", { ascending: true })
        .limit(1000),
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
      const inicioDate = getWeekStart(new Date((p as any).criado_em));
      const fimDate = new Date(inicioDate);
      fimDate.setDate(inicioDate.getDate() + 6);
      const inicioStr = toDateStr(inicioDate);
      const fimStr = toDateStr(fimDate);

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

    const semanaAtualStr = toDateStr(getWeekStart(new Date()));

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

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Cobranças</h1>
        <p className="text-sm text-gray-500 mt-1">
          Alunos com pendências financeiras na cantina
        </p>
      </div>
      <CobrancasList
        initialDevedores={(devedores as any) ?? []}
        ciclosSemanaisPorAluno={ciclosSemanaisPorAluno}
        semCredito={(semCredito as any) ?? []}
      />
    </AppLayout>
  );
}
