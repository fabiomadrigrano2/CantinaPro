"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function sendMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const emailNorm = email.toLowerCase().trim();

  // Valida se o e-mail está cadastrado como responsável (usa admin para bypassar RLS)
  const { data: aluno } = await admin
    .from("alunos")
    .select("id")
    .eq("email_responsavel", emailNorm)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .single();

  if (!aluno) {
    return {
      ok: false,
      error: "E-mail não cadastrado como responsável nesta cantina. Entre em contato com a cantina.",
    };
  }

  // Envia o magic link criando o usuário no Auth se ainda não existir
  const supabase = createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: emailNorm,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });

  if (otpError) {
    return { ok: false, error: "Erro ao enviar o link. Tente novamente em instantes." };
  }

  return { ok: true };
}

export async function checkResponsavel(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false, error: "Não autenticado." };

  const { data, error } = await supabase
    .from("alunos")
    .select("id, nome, turma, saldo")
    .eq("email_responsavel", user.email)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .single();

  if (error || !data) {
    await supabase.auth.signOut();
    return { ok: false, error: "E-mail não cadastrado como responsável nesta cantina." };
  }

  return { ok: true };
}

export async function atualizarLimiteDiario(
  limite: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Não autenticado." };

  const valor = Math.max(0, Math.min(50, Math.round(limite)));

  const { error } = await supabase
    .from("alunos")
    .update({ limite_diario: valor })
    .eq("email_responsavel", user.email)
    .eq("cantina_id", CANTINA_ID);

  if (error) return { ok: false, error: "Erro ao salvar o limite. Tente novamente." };
  return { ok: true };
}

export async function portalLogout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}
