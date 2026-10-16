import AppLayout from "@/components/layout/AppLayout";
import CobrancasList from "@/components/cobrancas/CobrancasList";
import ResumaoSemana from "@/components/cobrancas/ResumaoSemana";
import { carregarDadosCobrancas } from "@/lib/cobrancasDados";

export default async function CobrancasPage({
  searchParams,
}: {
  searchParams: { busca?: string };
}) {
  const { devedores, semCredito, alunosSemanais, ciclosSemanaisPorAluno, consumoSemana } =
    await carregarDadosCobrancas();

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Cobranças</h1>
          <p className="text-sm text-gray-500 mt-1">
            Alunos com pendências financeiras na cantina
          </p>
        </div>
        <ResumaoSemana
          devedores={devedores}
          alunosSemanais={alunosSemanais}
          ciclosSemanaisPorAluno={ciclosSemanaisPorAluno}
          consumoSemana={consumoSemana}
        />
      </div>
      <CobrancasList
        initialDevedores={devedores}
        ciclosSemanaisPorAluno={ciclosSemanaisPorAluno}
        semCredito={semCredito}
        initialSearch={searchParams.busca ?? ""}
      />
    </AppLayout>
  );
}
