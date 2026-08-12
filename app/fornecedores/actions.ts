"use server";

// Antes de usar esta tela, execute no SQL Editor do Supabase:
// ver migration_fornecedores.sql

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

type FrequenciaEntrega = Database["public"]["Enums"]["frequencia_entrega_tipo"];
type StatusPagamento = Database["public"]["Enums"]["compra_status_pagamento"];

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function createFornecedor(data: {
  nome: string;
  telefone: string;
  produtos_fornecidos: string;
  frequencia_entrega: FrequenciaEntrega;
  observacoes: string;
}): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("fornecedores").insert({
    cantina_id:          CANTINA_ID,
    nome:                data.nome.trim(),
    telefone:            data.telefone.trim() || null,
    produtos_fornecidos: data.produtos_fornecidos.trim() || null,
    frequencia_entrega:  data.frequencia_entrega,
    observacoes:         data.observacoes.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/fornecedores");
  return {};
}

export async function registrarCompra(
  fornecedorId: string,
  data: {
    data_entrega: string;
    descricao: string;
    valor: number;
    status_pagamento: StatusPagamento;
    data_vencimento: string | null;
    itens: { produto_id: string; quantidade: number }[];
  }
): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  // Mescla itens com produto_id duplicado (defesa server-side — a UI já
  // impede duplicata escondendo produtos já adicionados do seletor).
  const itensMap = new Map<string, number>();
  for (const item of data.itens) {
    if (!item.produto_id || item.quantidade <= 0) continue;
    itensMap.set(item.produto_id, (itensMap.get(item.produto_id) ?? 0) + item.quantidade);
  }
  const itens = Array.from(itensMap, ([produto_id, quantidade]) => ({ produto_id, quantidade }));

  let descricaoFinal = data.descricao.trim();
  if (!descricaoFinal && itens.length > 0) {
    const { data: produtosNomes } = await supabase
      .from("produtos")
      .select("id, nome")
      .in("id", itens.map((i) => i.produto_id));

    const nomeMap = new Map((produtosNomes ?? []).map((p) => [p.id, p.nome]));
    descricaoFinal = itens
      .map((i) => `${i.quantidade}x ${nomeMap.get(i.produto_id) ?? "Produto"}`)
      .join(", ");
  }

  if (!descricaoFinal) return { error: "Descreva os itens recebidos ou selecione ao menos um produto." };

  const { data: compra, error } = await supabase
    .from("compras_fornecedores")
    .insert({
      cantina_id:       CANTINA_ID,
      fornecedor_id:    fornecedorId,
      data_entrega:     data.data_entrega,
      descricao:        descricaoFinal,
      valor:            data.valor,
      status_pagamento: data.status_pagamento,
      data_vencimento:  data.status_pagamento === "a_pagar" ? data.data_vencimento : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  for (const item of itens) {
    const { error: itemError } = await supabase.from("compra_itens").insert({
      cantina_id: CANTINA_ID,
      compra_id:  compra.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
    });
    if (itemError) {
      return { error: `Compra registrada, mas falhou ao registrar item de estoque: ${itemError.message}` };
    }

    const { data: produtoAtual } = await supabase
      .from("produtos")
      .select("estoque")
      .eq("id", item.produto_id)
      .single();

    const novoEstoque = (produtoAtual?.estoque ?? 0) + item.quantidade;

    const { error: estoqueError } = await supabase
      .from("produtos")
      .update({ estoque: novoEstoque })
      .eq("id", item.produto_id);

    if (estoqueError) {
      return { error: `Compra registrada, mas falhou ao atualizar estoque: ${estoqueError.message}` };
    }

    await supabase.from("reposicoes").insert({
      cantina_id:            CANTINA_ID,
      produto_id:            item.produto_id,
      quantidade:            item.quantidade,
      origem:                "compra_fornecedor",
      compra_fornecedor_id:  compra.id,
    });
  }

  revalidatePath("/fornecedores");
  revalidatePath(`/fornecedores/${fornecedorId}`);
  revalidatePath("/produtos");
  return {};
}

export async function marcarCompraPaga(
  compraId: string,
  fornecedorId: string
): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("compras_fornecedores")
    .update({ status_pagamento: "pago", data_vencimento: null })
    .eq("id", compraId);

  if (error) return { error: error.message };

  revalidatePath("/fornecedores");
  revalidatePath(`/fornecedores/${fornecedorId}`);
  return {};
}
