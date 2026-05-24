"use client";

import { useState } from "react";
import { signInPortal, solicitarSenhaTemporaria } from "@/app/portal/login/actions";

type Step = "login" | "solicitar" | "enviado";

export default function PortalLoginForm() {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // signInPortal chama redirect() no servidor em caso de sucesso —
    // o Next.js navega automaticamente sem retornar ao client.
    // Se retornar, é porque houve erro de autenticação.
    const result = await signInPortal(email, password);

    setLoading(false);
    setError(result.error ?? "Ocorreu um erro. Tente novamente.");
  }

  async function handleSolicitar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await solicitarSenhaTemporaria(email);
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Ocorreu um erro. Tente novamente.");
        return;
      }
      setStep("enviado");
    } catch {
      setLoading(false);
      setError("Erro ao enviar o e-mail. Tente novamente em instantes.");
    }
  }

  if (step === "enviado") {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-500/15 border border-blue-500/30 mb-2">
          <span className="text-2xl">✉️</span>
        </div>
        <h2 className="text-lg font-semibold text-white">Verifique seu e-mail</h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Se o e-mail{" "}
          <span className="text-white font-medium">{email}</span>{" "}
          estiver cadastrado, você receberá um link para definir sua senha.
        </p>
        <button
          onClick={() => {
            setStep("login");
            setPassword("");
            setError(null);
          }}
          className="text-sm text-blue-400 hover:text-blue-300 underline transition pt-2 block mx-auto"
        >
          Voltar ao login
        </button>
      </div>
    );
  }

  if (step === "solicitar") {
    return (
      <form onSubmit={handleSolicitar} className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white mb-1">Primeiro acesso ou esqueci a senha</h2>
          <p className="text-xs text-gray-400 mb-4">
            Informe seu e-mail e enviaremos um link para você definir sua senha.
          </p>
          <label htmlFor="email-solicitar" className="block text-sm font-medium text-gray-300 mb-1.5">
            E-mail do responsável
          </label>
          <input
            id="email-solicitar"
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

        <button
          type="button"
          onClick={() => { setStep("login"); setError(null); }}
          className="w-full text-center text-sm text-gray-500 hover:text-gray-300 transition"
        >
          Voltar ao login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
          E-mail
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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
          placeholder="••••••••••"
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
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </button>

      <button
        type="button"
        onClick={() => { setStep("solicitar"); setError(null); }}
        className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition"
      >
        Primeiro acesso ou esqueci minha senha
      </button>
    </form>
  );
}
