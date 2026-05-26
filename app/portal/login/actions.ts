"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Resend } from "resend";

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

  const h = headers();
  const host  = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/portal/reset-password`;

  // Gera o link de reset via admin SDK (não dispara email — só retorna a URL)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: emailNorm,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error("[solicitarSenha] generateLink falhou:", linkError?.message);
    return { ok: false, error: "Erro ao gerar link de recuperação. Tente novamente." };
  }

  const actionLink = linkData.properties.action_link;
  console.log("[solicitarSenha] link gerado para:", emailNorm);

  // Envia o email via Resend (onboarding@resend.dev funciona sem verificar domínio)
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: "CantinaPro <onboarding@resend.dev>",
    to: emailNorm,
    subject: "Redefinição de senha — CantinaPro",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Redefinição de senha</h2>
        <p>Você solicitou a redefinição da sua senha na CantinaPro.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
        <a href="${actionLink}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
        <p style="color:#666;font-size:13px">Se você não solicitou a redefinição, ignore este e-mail.</p>
      </div>
    `,
  });

  if (sendError) {
    console.error("[solicitarSenha] Resend falhou:", sendError.message);
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
