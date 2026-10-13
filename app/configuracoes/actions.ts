"use server";

// Antes de usar esta tela, execute no SQL Editor do Supabase:
// ver migration_voz_correcoes.sql

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export type CorrecaoVozRow = {
  id: string;
  falado: string;
  corrigido: string;
};

export async function listarCorrecoesVoz(): Promise<CorrecaoVozRow[]> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("voz_correcoes")
    .select("id, falado, corrigido")
    .eq("cantina_id", CANTINA_ID)
    .order("corrigido")
    .order("falado");
  if (error) {
    console.error("[voz] falha ao listar correções:", error.message);
    return [];
  }
  return (data ?? []) as CorrecaoVozRow[];
}

export async function adicionarCorrecaoVoz(
  falado: string,
  corrigido: string,
): Promise<{ error?: string }> {
  const f = falado.trim().replace(/\s+/g, " ");
  const c = corrigido.trim().replace(/\s+/g, " ");
  if (!f || !c) return { error: "Preencha os dois campos." };
  if (f.toLowerCase() === c.toLowerCase()) return { error: "O texto falado e a correção são iguais." };

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("voz_correcoes")
    .insert({ cantina_id: CANTINA_ID, falado: f, corrigido: c });

  if (error) {
    if (error.code === "23505") return { error: `Já existe uma correção para "${f}".` };
    return { error: error.message };
  }

  revalidatePath("/configuracoes");
  return {};
}

export async function removerCorrecaoVoz(id: string): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("voz_correcoes")
    .delete()
    .eq("id", id)
    .eq("cantina_id", CANTINA_ID);
  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return {};
}
