"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "ready" | "error";

export default function PortalAuthPage() {
  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const rawHash = window.location.hash;
    console.log("[portal/auth] hash completo:", rawHash || "(vazio)");

    const params = new URLSearchParams(rawHash.slice(1));

    const errorCode = params.get("error");
    if (errorCode) {
      const desc = params.get("error_description") ?? "Link inválido ou expirado.";
      const msg  = desc.replace(/\+/g, " ");
      console.error("[portal/auth] erro no hash:", errorCode, msg);
      setErrorMsg(msg);
      setState("error");
      return;
    }

    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    console.log("[portal/auth] access_token presente:", !!accessToken);
    console.log("[portal/auth] refresh_token presente:", !!refreshToken);

    if (!accessToken || !refreshToken) {
      console.error("[portal/auth] tokens ausentes — hash não contém access_token/refresh_token");
      setErrorMsg("Link inválido ou expirado. Solicite um novo link de acesso.");
      setState("error");
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
          setErrorMsg("Erro ao iniciar sessão. Solicite um novo link de acesso.");
          setState("error");
          return;
        }

        console.log("[portal/auth] sessão OK — aguardando clique do usuário");
        setState("ready");
      });
  }, []);

  if (state === "error") {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-red-400">{errorMsg}</p>
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

  if (state === "ready") {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-white">Identidade confirmada</p>
            <p className="text-sm text-gray-400">Clique para acessar o portal do responsável.</p>
          </div>
          <a
            href="/portal/dashboard"
            className="inline-block w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition text-center"
          >
            Entrar no portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cp-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Verificando link...</p>
      </div>
    </div>
  );
}
