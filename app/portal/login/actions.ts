"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

// Verifica apenas se o email é um responsável válido desta cantina.
// O signInWithPassword é feito client-side para evitar o problema de
// cookies de sessão não chegarem ao middleware via server action + redirect().
export async function verifyResponsavel(
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

  if (!responsavel) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  return { ok: true };
}

export async function solicitarSenhaTemporaria(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  console.log("[solicitarSenha] email recebido:", email);
  const emailNorm = email.toLowerCase().trim();
  const admin = createAdminClient();

  // 1. Verifica se o e-mail pertence a um responsável desta cantina
  const { data: responsavel } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", emailNorm)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  if (!responsavel) return { ok: true }; // não revela se o e-mail existe

  // 2. Cria conta no Auth se for primeiro acesso (ignora erro "already exists")
  const { error: createError } = await admin.auth.admin.createUser({
    email: emailNorm,
    email_confirm: true,
  });
  const isPrimeiroAcesso = !createError;
  if (createError && !createError.message.toLowerCase().includes("already")) {
    console.error("[solicitarSenha] createUser falhou:", createError.message);
  }
  console.log("[solicitarSenha] isPrimeiroAcesso:", isPrimeiroAcesso, createError?.message ?? "");

  const h = headers();
  const host      = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto     = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/portal/reset-password`;

  // 3. Envia o link de acesso
  //    — Com Resend (domínio verificado): generateLink recovery + Resend
  //    — Sem Resend: inviteUserByEmail para primeiro acesso (Supabase SMTP)
  //                  resetPasswordForEmail para usuários existentes

  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

  if (hasResend) {
    // Caminho A: Resend com domínio verificado
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: emailNorm,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[solicitarSenha] generateLink falhou:", linkError?.message);
      return { ok: false, error: "Erro ao gerar link de recuperação." };
    }

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to:   emailNorm,
      subject: isPrimeiroAcesso
        ? "Bem-vindo ao Portal CantinaPro — Crie sua senha"
        : "Redefinição de senha — CantinaPro",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>${isPrimeiroAcesso ? "Primeiro acesso ao portal" : "Redefinição de senha"}</h2>
          <p>Clique no botão abaixo para ${isPrimeiroAcesso ? "criar sua senha" : "redefinir sua senha"}. O link expira em 1 hora.</p>
          <a href="${linkData.properties.action_link}"
             style="display:inline-block;margin:16px 0;padding:12px 24px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            ${isPrimeiroAcesso ? "Criar senha" : "Redefinir senha"}
          </a>
          <p style="color:#666;font-size:13px">Se não solicitou, ignore este e-mail.</p>
        </div>
      `,
    });

    if (sendError) {
      console.error("[solicitarSenha] Resend falhou:", JSON.stringify(sendError));
      return { ok: false, error: `Erro ao enviar e-mail: ${(sendError as any).message ?? "erro desconhecido"}` };
    }

    console.log("[solicitarSenha] e-mail enviado via Resend para:", emailNorm);
    return { ok: true };
  }

  // Caminho B: sem Resend — usa Supabase SMTP
  if (isPrimeiroAcesso) {
    // inviteUserByEmail cria + envia via Supabase SMTP; a página de reset aceita type=invite
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(emailNorm, {
      redirectTo,
    });
    if (inviteError) {
      console.error("[solicitarSenha] inviteUserByEmail falhou:", inviteError.message);
      return { ok: false, error: `Erro ao enviar convite: ${inviteError.message}` };
    }
    console.log("[solicitarSenha] convite enviado via Supabase SMTP para:", emailNorm);
  } else {
    // Usuário já tem conta — resetPasswordForEmail funciona para usuários existentes
    const { error: resetError } = await admin.auth.resetPasswordForEmail(emailNorm, {
      redirectTo,
    });
    if (resetError) {
      console.error("[solicitarSenha] resetPasswordForEmail falhou:", resetError.message);
      return { ok: false, error: `Erro ao enviar e-mail: ${resetError.message}` };
    }
    console.log("[solicitarSenha] e-mail de reset enviado via Supabase para:", emailNorm);
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
