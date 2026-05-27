import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import CobrancasList from "@/components/cobrancas/CobrancasList";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export default async function CobrancasPage() {
  const supabase = createClient();

  const { data: devedores } = await supabase
    .from("alunos")
    .select("id, nome, turma, saldo, ciclo_cobranca, dia_cobranca, telefone_responsavel")
    .eq("cantina_id", CANTINA_ID)
    .eq("tipo_conta", "fiado")
    .eq("ativo", true)
    .lt("saldo", 0)
    .order("saldo");

  const { data: semCredito } = await supabase
    .from("alunos")
    .select("id, nome, turma, saldo, telefone_responsavel")
    .eq("cantina_id", CANTINA_ID)
    .eq("tipo_conta", "credito")
    .eq("ativo", true)
    .lte("saldo", 0)
    .order("nome");

  const alunoIds = (devedores ?? []).map((a: any) => a.id as string);

  let pedidosPorAluno: Record<string, any[]> = {};
  if (alunoIds.length > 0) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id, aluno_id, total, criado_em, itens_pedido(nome_produto, quantidade)")
      .eq("cantina_id", CANTINA_ID)
      .eq("status", "confirmado")
      .in("aluno_id", alunoIds)
      .gte("criado_em", thirtyDaysAgo.toISOString())
      .order("criado_em", { ascending: false })
      .limit(500);

    for (const p of pedidos ?? []) {
      const aid = (p as any).aluno_id as string;
      if (!pedidosPorAluno[aid]) pedidosPorAluno[aid] = [];
      pedidosPorAluno[aid].push(p);
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
        pedidosPorAluno={pedidosPorAluno}
        semCredito={(semCredito as any) ?? []}
      />
    </AppLayout>
  );
}
