import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cantina do usuário logado (perfis.cantina_id) — a mesma regra de
// minha_cantina_id() no banco. Toda query feita com o admin client (que ignora
// RLS) precisa filtrar por este id. null = sem sessão ou sem perfil de cantina
// (ex.: responsável logado no portal).
export const getCantinaId = cache(async (): Promise<string | null> => {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return null;

  const { data: perfil } = await createAdminClient()
    .from("perfis")
    .select("cantina_id")
    .eq("id", user.id)
    .maybeSingle();

  return perfil?.cantina_id ?? null;
});

// Para páginas do painel: sem sessão volta ao login; logado sem perfil de
// cantina (responsável) vai para o portal.
export async function requireCantinaId(): Promise<string> {
  const cantinaId = await getCantinaId();
  if (cantinaId) return cantinaId;

  const { data: { user } } = await createClient().auth.getUser();
  redirect(user ? "/portal/dashboard" : "/login");
}

// Escapa curingas do ILIKE (% e _) para comparar e-mail sem diferenciar
// maiúsculas, mas sem casar outros e-mails por padrão.
export function emailIlike(email: string): string {
  return email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type ResponsavelPortal = {
  id: string;
  nome: string;
  email: string | null;
  cantina_id: string;
  user_id: string | null;
};

// Responsável do usuário logado no portal. A cantina vem do próprio cadastro
// do responsável: tudo que o portal mostra deve filtrar por esse cantina_id.
// Prefere o vínculo por user_id (feito no primeiro login); cai para o e-mail
// só enquanto o vínculo ainda não existe.
export async function buscarResponsavelPortal(user: {
  id: string;
  email?: string | null;
}): Promise<ResponsavelPortal | null> {
  const admin = createAdminClient();
  const campos = "id, nome, email, cantina_id, user_id";

  const { data: porUsuario } = await admin
    .from("responsaveis")
    .select(campos)
    .eq("user_id", user.id)
    .order("criado_em")
    .limit(1)
    .maybeSingle();
  if (porUsuario) return porUsuario;

  if (!user.email) return null;
  const { data: porEmail } = await admin
    .from("responsaveis")
    .select(campos)
    .ilike("email", emailIlike(user.email))
    .is("user_id", null)
    .order("criado_em")
    .limit(1)
    .maybeSingle();
  return porEmail ?? null;
}
