"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "sent" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  link_invalido:      "Link inválido. Solicite um novo link de acesso.",
  link_expirado:      "Link expirado. Solicite um novo link de acesso.",
  nao_autorizado:     "Acesso não autorizado.",
  email_nao_cadastrado: "E-mail não cadastrado como responsável nesta cantina. Entre em contato com a cantina.",
};

export default function PortalLoginForm() {
  const [step,    setStep]    = useState<Step>("email");
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const key    = params.get("error");
    return key ? (ERROR_MESSAGES[key] ?? "Ocorreu um erro. Tente novamente.") : null;
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase     = createClient();
    const redirectTo   = `${window.location.origin}/auth/callback?next=/portal/dashboard`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    setLoading(false);

    if (otpError) {
      // "shouldCreateUser: false" retorna erro quando o e-mail não existe no Auth
      setError("E-mail não encontrado. Verifique se está cadastrado ou entre em contato com a cantina.");
      return;
    }

    setStep("sent");
  }

  if (step === "sent") {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-500/15 border border-blue-500/30 mb-2">
          <span className="text-2xl">✉️</span>
        </div>
        <h2 className="text-lg font-semibold text-white">Verifique seu e-mail</h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Enviamos um link de acesso para{" "}
          <span className="text-white font-medium">{email}</span>.
          <br />
          Clique no link para entrar no portal.
        </p>
        <p className="text-xs text-gray-600 pt-2">
          Não recebeu? Verifique a caixa de spam ou{" "}
          <button
            onClick={() => { setStep("email"); setError(null); }}
            className="text-blue-400 hover:text-blue-300 underline transition"
          >
            tente novamente
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
          E-mail do responsável
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={loading}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
          placeholder="seu@email.com"
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
        className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 text-white font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-surface flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Enviando...
          </>
        ) : (
          "Enviar link de acesso"
        )}
      </button>

      <p className="text-center text-xs text-gray-600">
        Você receberá um link por e-mail para entrar sem precisar de senha.
      </p>
    </form>
  );
}
