"use client";

import { useState, useTransition } from "react";
import { salvarChavePix } from "@/app/configuracoes/actions";
import { PIX_TIPOS, linhaPix, type CantinaInfo } from "@/lib/cantinaInfo";

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

export default function ChavePixForm({ cantina }: { cantina: CantinaInfo }) {
  const [chave, setChave] = useState(cantina.pixChave ?? "");
  const [tipo, setTipo] = useState(cantina.pixTipo ?? "");
  const [nome, setNome] = useState(cantina.pixNome ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, startTransition] = useTransition();

  const previa = linhaPix({ ...cantina, pixChave: chave, pixTipo: tipo || null, pixNome: nome });

  function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const result = await salvarChavePix({ chave, tipo, nome });
      if (result.error) setErro(result.error);
      else setSalvo(true);
    });
  }

  return (
    <section className="space-y-5 mb-10">
      <div>
        <h2 className="text-lg font-semibold text-white">⚡ Chave Pix da cantina</h2>
        <p className="text-sm text-gray-500 mt-1">
          Aparece nas mensagens de cobrança e de saldo baixo enviadas pelo WhatsApp.
          Sem chave cadastrada, as mensagens saem sem a linha do Pix.
        </p>
      </div>

      <form
        onSubmit={handleSalvar}
        className="bg-cp-surface border border-cp-border rounded-2xl p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
          <label className="block">
            <span className="block text-sm text-gray-400 mb-1.5">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => { setTipo(e.target.value); setSalvo(false); }}
              className={inputCls}
            >
              <option value="">Não informar</option>
              {PIX_TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-gray-400 mb-1.5">Chave Pix</span>
            <input
              value={chave}
              onChange={(e) => { setChave(e.target.value); setSalvo(false); }}
              placeholder="Celular, CPF, e-mail ou chave aleatória"
              maxLength={140}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-sm text-gray-400 mb-1.5">Nome do titular (opcional)</span>
          <input
            value={nome}
            onChange={(e) => { setNome(e.target.value); setSalvo(false); }}
            placeholder="Como aparece no banco de quem paga"
            maxLength={120}
            className={inputCls}
          />
        </label>

        <div className="rounded-lg bg-cp-elevated border border-cp-border px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Como fica na mensagem</p>
          <p className="text-sm text-gray-200 break-words">
            {previa ?? <span className="italic text-gray-500">Sem linha de Pix</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow shadow-orange-500/25 transition disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar chave Pix"}
          </button>
          {salvo && <span className="text-sm text-emerald-400">Salvo!</span>}
          {erro && <span className="text-sm text-red-400">{erro}</span>}
        </div>
      </form>
    </section>
  );
}
