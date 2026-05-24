"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function signInPortal(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const emailNorm = email.toLowerCase().trim();
  const admin = createAdminClient();

  const { data: responsavel } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", emailNorm)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  if (!responsavel) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailNorm,
    password,
  });

  if (error) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  // redirect() dentro do server action garante que os cookies de sessão
  // são enviados junto com a resposta de redirect — padrão Supabase + Next.js
  redirect("/portal/dashboard");
}

export async function solicitarSenhaTemporaria(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const emailNorm = email.toLowerCase().trim();
  const admin = createAdminClient();

  const { data: responsavel } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", emailNorm)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  // Always return ok:true to prevent email enumeration
  if (!responsavel) return { ok: true };

  // Garante que o usuário existe no auth (cria se for primeiro acesso)
  // 422 = já existe — ignoramos e seguimos para enviar o reset
  await admin.auth.admin.createUser({ email: emailNorm, email_confirm: true });

  // Envia o e-mail de redefinição de senha via SMTP do Supabase
  const h = headers();
  const host  = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/portal/reset-password`;

  // implicit flow: tokens chegam no hash (#access_token=...) — mais simples sem PKCE
  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit" } },
  );

  console.log("[solicitarSenha] redirectTo:", redirectTo);

  const { error } = await anon.auth.resetPasswordForEmail(emailNorm, { redirectTo });
  if (error) {
    console.error("[solicitarSenha] resetPasswordForEmail falhou:", error.message);
    return { ok: false, error: "Erro ao enviar e-mail. Tente novamente." };
  }

  return { ok: true };
}

export async function atualizarLimiteDiario(
  limite: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      {
        aluno_id: link.aluno_id,
        cantina_id: CANTINA_ID,
        limite_valor_diario: valor,
      },
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
