"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCantinaId } from "@/lib/cantina";

export async function salvarCardapioDoDia(
  data: string,
  itens: { produto_id: string; quantidade_disponivel: number }[]
): Promise<{ error?: string }> {
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: "Sessão expirada. Entre novamente." };
  const supabase = createAdminClient();

  // Só aceita produtos da própria cantina no cardápio
  if (itens.length > 0) {
    const { data: proprios } = await supabase
      .from("produtos")
      .select("id")
      .eq("cantina_id", CANTINA_ID)
      .in("id", itens.map((i) => i.produto_id));
    if ((proprios ?? []).length !== new Set(itens.map((i) => i.produto_id)).size) {
      return { error: "Produto não encontrado." };
    }
  }

  const idsAtuais = itens.map((i) => i.produto_id);

  // O estoque dos salgados agora é descontado na venda (ver confirmSale()
  // em NovaVenda.tsx), não mais aqui — definir o cardápio do dia não
  // mexe mais em estoque.

  // Remove do cardápio do dia qualquer produto que não está mais selecionado
  // (cobre desmarcar um produto ao editar). Lista vazia = limpa o dia inteiro.
  let deleteQuery = supabase
    .from("cardapio_diario")
    .delete()
    .eq("cantina_id", CANTINA_ID)
    .eq("data", data);

  if (idsAtuais.length > 0) {
    deleteQuery = deleteQuery.not("produto_id", "in", `(${idsAtuais.join(",")})`);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) return { error: deleteError.message };

  if (itens.length > 0) {
    const { error: upsertError } = await supabase
      .from("cardapio_diario")
      .upsert(
        itens.map((item) => ({
          cantina_id: CANTINA_ID,
          produto_id: item.produto_id,
          data,
          quantidade_disponivel: item.quantidade_disponivel,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: "cantina_id,produto_id,data" }
      );

    if (upsertError) return { error: upsertError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/produtos");
  return {};
}
