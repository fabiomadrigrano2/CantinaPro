import Link from "next/link";

// ── tipos ─────────────────────────────────────────────────────────────────────

type AlunoCobrancaHoje = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── componente ────────────────────────────────────────────────────────────────

export default function CobrancasHojeSection({ alunos }: { alunos: AlunoCobrancaHoje[] }) {
  if (alunos.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          Cobranças de hoje
        </h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-orange-400 bg-orange-400/10 border-orange-400/20">
          {alunos.length}
        </span>
      </div>

      <div className="space-y-2">
        {alunos.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-surface hover:bg-cp-elevated transition-colors"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm bg-orange-400/10 text-orange-400">
              📅
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{a.nome}</p>
              <p className="text-xs text-gray-500 mt-0.5">{a.turma ?? "—"}</p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-red-400 tabular-nums">
                {fmt(Math.abs(a.saldo))}
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5">em aberto</p>
            </div>

            <Link
              href={`/cobrancas?busca=${encodeURIComponent(a.nome)}`}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
            >
              Cobrar
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
