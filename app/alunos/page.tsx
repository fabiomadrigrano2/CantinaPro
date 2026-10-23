import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import AlunosList from "@/components/alunos/AlunosList";
import { requireCantinaId } from "@/lib/cantina";

export default async function AlunosPage() {
  const CANTINA_ID = await requireCantinaId();
  const supabase = createClient();

  const { data: alunos, error } = await supabase
    .from("alunos")
    .select("id, nome, turma, ativo, saldo, tipo_conta, ciclo_cobranca, dia_cobranca, limite_diario, conta_paga, telefone_responsavel, email_responsavel, nome_responsavel, limite_alerta_saldo, notificar_consumo")
    .eq("cantina_id", CANTINA_ID)
    .order("ativo", { ascending: false })
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
      <AlunosList initialAlunos={(alunos as any) ?? []} cantinaId={CANTINA_ID} />
    </AppLayout>
  );
}
