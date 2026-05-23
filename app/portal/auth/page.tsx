"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortalAuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));

    const errorCode = params.get("error");
    if (errorCode) {
      const desc = params.get("error_description") ?? "Link inválido ou expirado.";
      setError(desc.replace(/\+/g, " "));
      return;
    }

    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setError("Link inválido ou expirado. Solicite um novo link de acesso.");
      return;
    }

    const supabase = createClient();

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError("Erro ao iniciar sessão. Solicite um novo link de acesso.");
          return;
        }
        router.replace("/portal/dashboard");
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
