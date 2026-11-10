"use server";

// Antes de usar esta tela, execute no SQL Editor do Supabase:
// ver migration_voz_correcoes.sql

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCantinaId } from "@/lib/cantina";
import { PIX_TIPOS } from "@/lib/cantinaInfo";

const SEM_SESSAO = "Sessão expirada. Entre novamente.";

export type CorrecaoVozRow = {
  id: string;
  falado: string;
  corrigido: string;
};

export async function listarCorrecoesVoz(): Promise<CorrecaoVozRow[]> {
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return [];
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

  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
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
  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
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

// Chave Pix usada nas mensagens de WhatsApp da cantina. Chave vazia limpa os
// três campos (as mensagens passam a sair sem a linha do Pix).
export async function salvarChavePix({
  chave,
  tipo,
  nome,
}: {
  chave: string;
  tipo: string;
  nome: string;
}): Promise<{ error?: string }> {
  const pixChave = chave.trim();
  const pixTipo = tipo.trim();
  const pixNome = nome.trim().replace(/\s+/g, " ");
  if (pixChave.length > 140) return { error: "Chave Pix muito longa." };
  if (pixNome.length > 120) return { error: "Nome do titular muito longo." };
  if (pixTipo && !PIX_TIPOS.some((t) => t.value === pixTipo)) return { error: "Tipo de chave inválido." };

  const CANTINA_ID = await getCantinaId();
  if (!CANTINA_ID) return { error: SEM_SESSAO };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("cantinas")
    .update({
      pix_chave: pixChave || null,
      pix_tipo:  pixChave && pixTipo ? pixTipo : null,
      pix_nome:  pixChave && pixNome ? pixNome : null,
    })
    .eq("id", CANTINA_ID);
  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  revalidatePath("/cobrancas");
  revalidatePath("/dashboard");
  return {};
}
