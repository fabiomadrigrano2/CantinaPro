import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import type { CookieOptions } from "@supabase/ssr";

// First pass: browser lands here with tokens in the hash fragment.
// The server can't read the hash, so we serve minimal inline JS that
// extracts the tokens and redirects back with them as query params.
//
// Second pass: tokens arrive as query params — setSession server-side,
// write cookies onto the redirect response, send to /portal/dashboard.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const accessToken  = searchParams.get("access_token");
  const refreshToken = searchParams.get("refresh_token");
  const errorParam   = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${origin}/portal/login?error=link_invalido`);
  }

  if (!accessToken || !refreshToken) {
    // Serve a minimal page that moves hash tokens → query params
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Autenticando…</title></head>
<body><script>
(function () {
  var p = new URLSearchParams(window.location.hash.slice(1));
  var at  = p.get("access_token");
  var rt  = p.get("refresh_token");
  var err = p.get("error");
  if (err || !at || !rt) {
    window.location.replace("/portal/login?error=link_invalido");
  } else {
    window.location.replace(
      "/api/portal/auth?access_token=" + encodeURIComponent(at) +
      "&refresh_token="                + encodeURIComponent(rt)
    );
  }
}());
</script></body></html>`;
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Second pass — set the session server-side and collect the cookies
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => pendingCookies.push(...cookiesToSet),
      },
    }
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    console.error("[api/portal/auth] setSession error:", sessionError.message);
    return NextResponse.redirect(`${origin}/portal/login?error=link_expirado`);
  }

  const response = NextResponse.redirect(`${origin}/portal/dashboard`);
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
}
