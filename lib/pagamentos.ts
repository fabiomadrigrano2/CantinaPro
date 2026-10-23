import { createAdminClient } from "@/lib/supabase/admin";
import { getCantinaId } from "@/lib/cantina";

// Grava o pagamento no histórico (tabela pagamentos), exibido no Portal do
// Responsável. Insere já como "confirmado": o trigger trg_creditar_pagamento
// só roda em UPDATE, então o saldo — que quem chama já atualizou — não é
// creditado de novo. Falha aqui não desfaz o pagamento; só é logada.
// Retorna o id do registro (null se falhou) — o Modo Na Correria guarda esse id
// para marcar o pagamento como estornado ao desfazer.
export async function salvarHistoricoPagamento({
  alunoId,
  valor,
  formaPagamento,
  tipo,
  descricao,
}: {
  alunoId: string;
  valor: number;
  formaPagamento: string;
  tipo: "credito" | "fiado";
  descricao: string;
}): Promise<string | null> {
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return null;
  const supabase = createAdminClient();

  const { data: conta } = await supabase
    .from("contas")
    .select("id")
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();

  const agora = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("pagamentos").insert({
    cantina_id:      CANTINA_ID,
    aluno_id:        alunoId,
    conta_id:        conta?.id ?? null,
    valor,
    forma_pagamento: formaPagamento,
    tipo,
    observacao:      descricao,
    status:          "confirmado",
    confirmado_em:   agora,
  }).select("id").single();

  if (error) {
    console.error("[pagamentos] falha ao salvar histórico:", error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}
