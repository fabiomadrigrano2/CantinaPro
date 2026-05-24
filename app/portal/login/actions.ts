"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function gerarSenha(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

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

  return { ok: true };
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

  const senha = gerarSenha();

  // Try to create user — if already exists, find and update password
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailNorm,
    password: senha,
    email_confirm: true,
  });

  if (!created?.user && createErr) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === emailNorm);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password: senha });
    }
  }

  await enviarSenha(emailNorm, senha);
  return { ok: true };
}

async function enviarSenha(email: string, senha: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/portal/login`;

  await resend.emails.send({
    from: "CantinaPro <noreply@cantina.pro>",
    to: email,
    subject: "Sua senha temporária — Portal do Responsável",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#ffffff">
        <h2 style="color:#1e293b;margin:0 0 8px;font-size:20px">Portal do Responsável</h2>
        <p style="color:#475569;margin:0 0 24px;font-size:15px;line-height:1.5">
          Sua senha temporária de acesso ao portal é:
        </p>
        <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:30px;font-weight:700;letter-spacing:6px;color:#1e293b;font-family:monospace">${senha}</span>
        </div>
        <a href="${loginUrl}" style="display:block;background:#3b82f6;color:#ffffff;text-align:center;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:24px">
          Entrar no portal
        </a>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5">
          Se você não solicitou esta senha, ignore este e-mail.
        </p>
      </div>
    `,
  });
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
