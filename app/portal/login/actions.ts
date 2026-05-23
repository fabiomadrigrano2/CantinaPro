"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function sendMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin     = createAdminClient();
  const emailNorm = email.toLowerCase().trim();

  // Verifica se o e-mail está cadastrado como responsável (admin bypassa RLS)
  // Usa ilike para comparação case-insensitive e maybeSingle para não lançar
  // erro quando nenhuma linha é encontrada
  const { data: aluno, error: dbError } = await admin
    .from("alunos")
    .select("id")
    .ilike("email_responsavel", emailNorm)
    .limit(1)
    .maybeSingle();

  if (dbError) {
    console.error("[sendMagicLink] erro ao consultar alunos:", dbError.message);
    return { ok: false, error: "Erro ao verificar o e-mail. Tente novamente." };
  }

  if (!aluno) {
    return {
      ok: false,
      error: "E-mail não cadastrado como responsável nesta cantina. Entre em contato com a cantina.",
    };
  }

  // Envia o magic link usando anon key — service role não dispara e-mail de auth
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error: otpError } = await anonClient.auth.signInWithOtp({
    email: emailNorm,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });

  if (otpError) {
    console.error("[sendMagicLink] erro ao enviar OTP:", otpError.message);
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
