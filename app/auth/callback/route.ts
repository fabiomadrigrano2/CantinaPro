import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/login?error=link_invalido`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/portal/login?error=link_expirado`);
  }

  // Verifica se o e-mail está cadastrado como responsável nesta cantina
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(`${origin}/portal/login?error=nao_autorizado`);
  }

  const { data: aluno } = await supabase
    .from("alunos")
    .select("id")
    .eq("email_responsavel", user.email)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .single();

  if (!aluno) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/portal/login?error=email_nao_cadastrado`
    );
  }

  return response;
}
