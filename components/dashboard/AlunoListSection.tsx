"use client";

import { useState } from "react";

// ── tipos ─────────────────────────────────────────────────────────────────────

type AlunoSaldo = {
  nome: string;
  turma: string | null;
  saldo: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const LIMITE_VISIVEL = 5;

// ── sub-componentes ───────────────────────────────────────────────────────────

function AlunoRow({
  aluno,
  variant,
}: {
  aluno: AlunoSaldo;
  variant: "saldo" | "cobranca";
}) {
  const isSaldo    = variant === "saldo";
  const isNegative = aluno.saldo < 0;
  const isZero     = aluno.saldo === 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-surface hover:bg-cp-elevated transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${
        isSaldo
          ? "bg-amber-400/10 text-amber-400"
          : "bg-red-500/10 text-red-400"
      }`}>
        👤
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{aluno.nome}</p>
        <p className="text-xs text-gray-500 mt-0.5">{aluno.turma ?? "—"}</p>
      </div>

      {isSaldo ? (
        <span className={`text-sm font-bold tabular-nums ${
          isNegative ? "text-red-400" : isZero ? "text-gray-400" : "text-amber-400"
        }`}>
          {fmt(aluno.saldo)}
        </span>
      ) : (
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-red-400 tabular-nums">
            {fmt(Math.abs(aluno.saldo))}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">em aberto</p>
        </div>
      )}
    </div>
  );
}

// ── componente ────────────────────────────────────────────────────────────────

export default function AlunoListSection({
  title,
  alunos,
  variant,
  keyPrefix,
  badgeCls,
  footer,
}: {
  title: string;
  alunos: AlunoSaldo[];
  variant: "saldo" | "cobranca";
  keyPrefix: string;
  badgeCls: string;
  footer?: React.ReactNode;
}) {
  const [expandido, setExpandido] = useState(false);

  if (alunos.length === 0) return null;

  const visiveis = expandido ? alunos : alunos.slice(0, LIMITE_VISIVEL);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          {title}
        </h2>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeCls}`}>
          {alunos.length}
        </span>
      </div>

      <div className="space-y-2">
        {visiveis.map((a) => (
          <AlunoRow key={`${keyPrefix}-${a.nome}`} aluno={a} variant={variant} />
        ))}
      </div>

      {alunos.length > LIMITE_VISIVEL && (
        <div className="flex justify-center mt-3">
          <button
            onClick={() => setExpandido((v) => !v)}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-cp-elevated hover:bg-cp-border border border-cp-border rounded-xl transition-all"
          >
            {expandido ? "Ver menos" : `Ver mais (${alunos.length - LIMITE_VISIVEL})`}
          </button>
        </div>
      )}

      {footer}
    </section>
  );
}
