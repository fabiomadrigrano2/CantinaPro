"use server";

// Antes de usar esta tela, execute no SQL Editor do Supabase:
//
//   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🍽️';
//   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 5;

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID_TEMP = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function createProduto(data: {
  emoji: string;
  nome: string;
  preco: number;
  estoque: number;
  estoque_minimo: number;
}) {
  const supabase = createAdminClient();
  const cantina_id = CANTINA_ID_TEMP;

  const { error } = await supabase.from("produtos").insert({
    cantina_id,
    emoji:          data.emoji || "🍽️",
    nome:           data.nome,
    preco:          data.preco,
    estoque:        data.estoque,
    estoque_minimo: data.estoque_minimo,
    disponivel:     true,
  });

  if (error) return { error: error.message };

  revalidatePath("/produtos");
  return { success: true };
}
