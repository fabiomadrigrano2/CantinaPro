import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import TreinamentoVoz from "@/components/configuracoes/TreinamentoVoz";
import { listarCorrecoesVoz } from "@/app/configuracoes/actions";

export const dynamic = "force-dynamic";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export default async function ConfiguracoesPage() {
  const supabase = createClient();

  // Mesmos filtros da Nova Venda, para o "Testar" entender igual à venda real
  const [correcoes, { data: alunos }, { data: produtos }] = await Promise.all([
    listarCorrecoesVoz(),
    supabase.from("alunos").select("id, nome")
      .eq("cantina_id", CANTINA_ID).eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, nome")
      .eq("cantina_id", CANTINA_ID).eq("disponivel", true).order("nome"),
  ]);

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Ajustes gerais da cantina</p>
      </div>
      <TreinamentoVoz
        correcoesIniciais={correcoes}
        alunos={(alunos as { id: string; nome: string }[]) ?? []}
        produtos={(produtos as { id: string; nome: string }[]) ?? []}
      />
    </AppLayout>
  );
}
