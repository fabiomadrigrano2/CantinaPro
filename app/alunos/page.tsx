import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import AlunosList from "@/components/alunos/AlunosList";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export default async function AlunosPage() {
  const supabase = createClient();

  const { data: alunos, error } = await supabase
    .from("alunos")
    .select("id, nome, turma, ativo, saldo, tipo_conta, ciclo_cobranca, dia_cobranca, limite_diario, conta_paga, telefone_responsavel, email_responsavel")
    .eq("cantina_id", CANTINA_ID)
    .order("nome");

  console.log("[AlunosPage] total:", alunos?.length ?? 0, "| erro:", error?.message ?? "nenhum");
  if (alunos?.length) console.log("[AlunosPage] primeiro aluno:", JSON.stringify(alunos[0]));

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Alunos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie os alunos e saldos cadastrados na cantina
        </p>
      </div>
      <AlunosList initialAlunos={(alunos as any) ?? []} />
    </AppLayout>
  );
}
