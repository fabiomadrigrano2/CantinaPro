"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function salvarCardapioDoDia(
  data: string,
  itens: { produto_id: string; quantidade_disponivel: number }[]
): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  const idsAtuais = itens.map((i) => i.produto_id);

  // Salgados: o estoque não é descontado por venda (ver confirmSale() em
  // NovaVenda.tsx) — é descontado aqui, no momento em que a quantidade do
  // cardápio de hoje é definida/editada. Para não descontar duas vezes ao
  // reeditar o cardápio no mesmo dia, aplicamos só o delta entre a
  // quantidade anterior e a nova (reduzir/remover devolve estoque).
  const { data: existentes } = await supabase
    .from("cardapio_diario")
    .select("produto_id, quantidade_disponivel")
    .eq("cantina_id", CANTINA_ID)
    .eq("data", data);

  const qtdAnterior = new Map((existentes ?? []).map((e) => [e.produto_id, e.quantidade_disponivel]));
  const qtdNova = new Map(itens.map((i) => [i.produto_id, i.quantidade_disponivel]));
  const idsEnvolvidos = Array.from(
    new Set([...Array.from(qtdAnterior.keys()), ...Array.from(qtdNova.keys())])
  );

  if (idsEnvolvidos.length > 0) {
    const { data: produtosEnvolvidos } = await supabase
      .from("produtos")
      .select("id, categoria, estoque")
      .in("id", idsEnvolvidos);

    for (const produto of produtosEnvolvidos ?? []) {
      if (produto.categoria !== "salgados") continue;

      const delta = (qtdNova.get(produto.id) ?? 0) - (qtdAnterior.get(produto.id) ?? 0);
      if (delta === 0) continue;

      const novoEstoque = Math.max(0, (produto.estoque ?? 0) - delta);
      const { error: estoqueError } = await supabase
        .from("produtos")
        .update({ estoque: novoEstoque })
        .eq("id", produto.id);

      if (estoqueError) return { error: `Falha ao ajustar estoque do salgado: ${estoqueError.message}` };
    }
  }

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
