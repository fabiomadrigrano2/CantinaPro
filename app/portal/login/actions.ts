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
): Promise<{ ok: boolean; error?: string; link?: string }> {
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

  if (!responsavel) return { ok: true };

  // 2. Cria conta no Auth se ainda não existir (ignora erro "already exists")
  const { error: createError } = await admin.auth.admin.createUser({
    email: emailNorm,
    email_confirm: true,
  });
  console.log("[solicitarSenha] createUser:", createError?.message ?? "ok");

  const h = headers();
  const host      = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto     = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/portal/reset-password`;

  // 3. Gera o link de recovery diretamente (não depende do SMTP do Supabase)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: emailNorm,
    options: { redirectTo },
  });

  console.log("[solicitarSenha] generateLink:", linkError?.message ?? "ok",
    "action_link presente:", !!linkData?.properties?.action_link);

  if (linkError || !linkData?.properties?.action_link) {
    return { ok: false, error: `Erro ao gerar link: ${linkError?.message ?? "resposta vazia"}` };
  }

  const actionLink = linkData.properties.action_link;

  // 4. Envia por e-mail se Resend estiver configurado com domínio verificado
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from:    process.env.RESEND_FROM,
      to:      emailNorm,
      subject: "Acesso ao Portal CantinaPro",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Acesso ao Portal</h2>
          <p>Clique no botão abaixo para definir sua senha. O link expira em 1 hora.</p>
          <a href="${actionLink}"
             style="display:inline-block;margin:16px 0;padding:12px 24px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Acessar portal
          </a>
        </div>
      `,
    });
    if (sendError) {
      console.error("[solicitarSenha] Resend falhou:", JSON.stringify(sendError));
      return { ok: false, error: `Erro Resend: ${(sendError as any).message ?? "desconhecido"}` };
    }
    console.log("[solicitarSenha] e-mail enviado via Resend para:", emailNorm);
    return { ok: true };
  }

  // Sem Resend: retorna o link para exibição na tela (modo de teste)
  console.log("[solicitarSenha] sem Resend — retornando link para exibição na tela");
  return { ok: true, link: actionLink };
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
