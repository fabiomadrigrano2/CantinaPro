"use server";

// Antes de usar esta tela, execute no SQL Editor do Supabase:
//
//   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🍽️';
//   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 5;

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCantinaId, requireCantinaId } from "@/lib/cantina";

// Cardápio padrão para cantina nova: nomes universais, preço 0 (o cantineiro
// define depois — a Nova Venda bloqueia produto sem preço).
const PRODUTOS_PADRAO = [
  { categoria: "salgados", nome: "Coxinha",          emoji: "🍗" },
  { categoria: "salgados", nome: "Esfiha",           emoji: "🥙" },
  { categoria: "salgados", nome: "Pão de Queijo",    emoji: "🧀" },
  { categoria: "doces",    nome: "Pirulito",         emoji: "🍭" },
  { categoria: "doces",    nome: "Chocolate",        emoji: "🍫" },
  { categoria: "doces",    nome: "Bala",             emoji: "🍬" },
  { categoria: "bebidas",  nome: "Água",             emoji: "💧" },
  { categoria: "bebidas",  nome: "Suco",             emoji: "🧃" },
  { categoria: "bebidas",  nome: "Refrigerante lata", emoji: "🥤" },
];

export async function seedProdutosPadrao(): Promise<{ inseridos?: number; error?: string }> {
  // Cantina sempre do usuário logado (sem sessão, redireciona ao login)
  const cantina_id = await requireCantinaId();
  const supabase = createAdminClient();

  const { data: existentes, error: listError } = await supabase
    .from("produtos")
    .select("nome")
    .eq("cantina_id", cantina_id);
  if (listError) return { error: listError.message };

  const nomes = new Set((existentes ?? []).map((p) => (p.nome ?? "").trim().toLowerCase()));
  const novos = PRODUTOS_PADRAO
    .filter((p) => !nomes.has(p.nome.toLowerCase()))
    .map((p) => ({
      cantina_id,
      nome:       p.nome,
      categoria:  p.categoria,
      emoji:      p.emoji,
      preco:      0,
      disponivel: true,
      estoque:    null,
    }));

  if (novos.length > 0) {
    const { error } = await supabase.from("produtos").insert(novos);
    if (error) return { error: error.message };
  }

  revalidatePath("/produtos");
  revalidatePath("/vendas/nova");
  return { inseridos: novos.length };
}

export async function createProduto(data: {
  emoji: string;
  nome: string;
  preco: number;
  estoque: number;
  estoque_minimo: number;
}) {
  const cantina_id = await getCantinaId();
  if (!cantina_id) return { error: "Sessão expirada. Entre novamente." };
  const supabase = createAdminClient();

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
