"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortalAuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rawHash = window.location.hash;
    console.log("[portal/auth] hash completo:", rawHash || "(vazio)");

    const params = new URLSearchParams(rawHash.slice(1));

    const errorCode = params.get("error");
    if (errorCode) {
      const desc = params.get("error_description") ?? "Link inválido ou expirado.";
      const msg  = desc.replace(/\+/g, " ");
      console.error("[portal/auth] erro no hash:", errorCode, msg);
      setError(msg);
      return;
    }

    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    console.log("[portal/auth] access_token presente:", !!accessToken);
    console.log("[portal/auth] refresh_token presente:", !!refreshToken);

    if (!accessToken || !refreshToken) {
      console.error("[portal/auth] tokens ausentes — hash não contém access_token/refresh_token");
      setError("Link inválido ou expirado. Solicite um novo link de acesso.");
      return;
    }

    const supabase = createClient();

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error: sessionError }) => {
        console.log("[portal/auth] setSession resultado:", {
          user:  data?.user?.email ?? null,
          error: sessionError ? `${sessionError.name}: ${sessionError.message}` : null,
        });

        if (sessionError) {
          setError("Erro ao iniciar sessão. Solicite um novo link de acesso.");
          return;
        }
        console.log("[portal/auth] sessão OK — redirecionando para /portal/dashboard");
        window.location.href = "/portal/dashboard";
      });
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-red-400">{error}</p>
          <a
            href="/portal/login"
            className="inline-block text-sm text-blue-400 hover:text-blue-300 underline transition"
          >
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cp-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Entrando no portal...</p>
      </div>
    </div>
  );
}
