"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "loading" | "form" | "success" | "error";

export default function PortalResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cp-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const [step, setStep]         = useState<Step>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    // Implicit flow: tokens chegam no hash — ex: #access_token=...&type=recovery
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type         = params.get("type");

    console.log("[reset-password] type:", type, "access_token presente:", !!accessToken);

    if (!accessToken || !refreshToken || type !== "recovery") {
      setStep("error");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("[reset-password] setSession:", error.message);
          setStep("error");
        } else {
          setStep("form");
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Erro ao salvar a senha. Tente novamente.");
      setLoading(false);
      return;
    }

    setStep("success");
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Verificando link...</p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-red-400">Link inválido ou expirado. Solicite um novo link.</p>
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

  if (step === "success") {
    return (
      <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-2">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-semibold text-white">Senha definida com sucesso!</p>
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
    <div className="min-h-screen bg-cp-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4 shadow-lg shadow-blue-500/20">
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Defina sua senha</h1>
          <p className="text-gray-400 mt-1 text-sm">Crie uma senha para acessar o portal</p>
        </div>

        <div className="bg-cp-surface border border-cp-border rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-300 mb-1.5">
                Confirmar senha
              </label>
              <input
                id="confirm"
                type="password"
                required
                disabled={loading}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
                placeholder="Repita a senha"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar senha"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
