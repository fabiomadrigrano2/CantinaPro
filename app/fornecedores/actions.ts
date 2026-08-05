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
  }
): Promise<{ error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("compras_fornecedores").insert({
    cantina_id:       CANTINA_ID,
    fornecedor_id:    fornecedorId,
    data_entrega:     data.data_entrega,
    descricao:        data.descricao.trim(),
    valor:            data.valor,
    status_pagamento: data.status_pagamento,
    data_vencimento:  data.status_pagamento === "a_pagar" ? data.data_vencimento : null,
  });

  if (error) return { error: error.message };

  revalidatePath("/fornecedores");
  revalidatePath(`/fornecedores/${fornecedorId}`);
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
