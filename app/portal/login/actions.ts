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

  const { data: responsavel, error: dbError } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", emailNorm)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  if (dbError) {
    console.error("[sendMagicLink] erro ao consultar responsaveis:", dbError.message);
    return { ok: false, error: "Erro ao verificar o e-mail. Tente novamente." };
  }

  if (!responsavel) {
    return {
      ok: false,
      error: "E-mail não cadastrado como responsável nesta cantina. Entre em contato com a cantina.",
    };
  }

  // Anon key client — service role does not send auth emails
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", user.email)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

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
  const admin = createAdminClient();

  const { data: responsavel } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", user.email)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  if (!responsavel) return { ok: false, error: "Responsável não encontrado." };

  const { data: link } = await admin
    .from("aluno_responsavel")
    .select("aluno_id")
    .eq("responsavel_id", responsavel.id)
    .limit(1)
    .maybeSingle();

  if (!link) return { ok: false, error: "Aluno não encontrado." };

  const { error } = await admin
    .from("limites_aluno")
    .upsert(
      { aluno_id: link.aluno_id, cantina_id: CANTINA_ID, limite_valor_diario: valor },
      { onConflict: "aluno_id" },
    );

  if (error) return { ok: false, error: "Erro ao salvar o limite. Tente novamente." };
  return { ok: true };
}

export async function portalLogout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}
