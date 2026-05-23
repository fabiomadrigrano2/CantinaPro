"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkResponsavel } from "@/app/portal/login/actions";

export default function PortalLoginForm() {
  const router  = useRouter();
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    formData.get("email")    as string,
      password: formData.get("password") as string,
    });

    if (signInError) {
      setError("E-mail ou senha incorretos. Tente novamente.");
      setLoading(false);
      return;
    }

    // Verify the logged-in user is a responsável
    const result = await checkResponsavel();
    if (!result.ok) {
      setError(result.error ?? "Acesso não autorizado.");
      setLoading(false);
      return;
    }

    router.push("/portal/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
          E-mail do responsável
        </label>
        <input
          id="email" name="email" type="email"
          autoComplete="email" required disabled={loading}
          className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
          placeholder="seu@email.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
          Senha
        </label>
        <input
          id="password" name="password" type="password"
          autoComplete="current-password" required disabled={loading}
          className="w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-50"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit" disabled={loading}
        className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 text-white font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-surface flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Verificando...
          </>
        ) : (
          "Acessar portal"
        )}
      </button>
    </form>
  );
}
