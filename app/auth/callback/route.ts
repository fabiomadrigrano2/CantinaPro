import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import type { CookieOptions } from "@supabase/ssr";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/login?error=link_invalido`);
  }

  // Collect cookies emitted during the exchange so we can apply them to the
  // final response only after all validations pass.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/portal/login?error=link_expirado`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(`${origin}/portal/login?error=nao_autorizado`);
  }

  // Admin client bypasses RLS for verification
  const admin = createAdminClient();

  const { data: responsavel } = await admin
    .from("responsaveis")
    .select("id, user_id")
    .ilike("email", user.email)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  if (!responsavel) {
    return NextResponse.redirect(`${origin}/portal/login?error=email_nao_cadastrado`);
  }

  // Link auth user to responsavel on first login
  if (!responsavel.user_id) {
    await admin
      .from("responsaveis")
      .update({ user_id: user.id })
      .eq("id", responsavel.id);
  }

  // All validations passed — create the redirect and apply session cookies
  const response = NextResponse.redirect(`${origin}/portal/dashboard`);
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
}
