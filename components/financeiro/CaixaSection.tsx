"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── tipos ─────────────────────────────────────────────────────────────────────

export type Movimentacao = {
  id: string;
  data: string;
  tipo: "abertura" | "entrada" | "saida";
  valor: number;
  descricao: string;
  saldo_apos: number;
  criado_em: string;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDatetime = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

const BADGE: Record<string, { label: string; cls: string }> = {
  abertura: { label: "Abertura", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  entrada:  { label: "Entrada",  cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  saida:    { label: "Saída",    cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

// ── componente ────────────────────────────────────────────────────────────────

type ModalTipo = "abertura" | "saida" | null;

export default function CaixaSection({
  saldoCaixa,
  movimentacoes,
  cantinaId,
}: {
  saldoCaixa: number;
  movimentacoes: Movimentacao[];
  cantinaId: string;
}) {
  const router = useRouter();
  const [modal,    setModal]    = useState<ModalTipo>(null);
  const [form,     setForm]     = useState({ valor: "", descricao: "" });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  const LIMITE_VISIVEL = 5;
  const movimentacoesVisiveis = expandido ? movimentacoes : movimentacoes.slice(0, LIMITE_VISIVEL);

  function openModal(tipo: ModalTipo) {
    setForm({ valor: "", descricao: "" });
    setError(null);
    setModal(tipo);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0) { setError("Informe um valor válido."); return; }
    if (modal === "saida" && !form.descricao.trim()) {
      setError("A descrição é obrigatória para retiradas.");
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient() as any;

    // Recalcula saldo atual a partir de todas as movimentações (evita race condition)
    const { data: todasMovs } = await supabase
      .from("movimentacoes_caixa")
      .select("tipo, valor")
      .eq("cantina_id", cantinaId);

    const saldoAtual = (todasMovs ?? []).reduce(
      (acc: number, m: any) => acc + (m.tipo === "saida" ? -m.valor : m.valor),
      0
    );

    const delta     = modal === "saida" ? -valor : valor;
    const novoSaldo = saldoAtual + delta;

    const descricao =
      modal === "abertura"
        ? form.descricao.trim() || "Saldo inicial do caixa"
        : form.descricao.trim();

    const { error: err } = await supabase.from("movimentacoes_caixa").insert({
      cantina_id: cantinaId,
      data:       new Date().toISOString(),
      tipo:       modal,
      valor,
      descricao,
      saldo_apos: novoSaldo,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }

    setModal(null);
    router.refresh();
  }

  return (
    <>
      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-cp-border">
              <h3 className="text-base font-semibold text-white">
                {modal === "abertura" ? "Definir saldo inicial" : "Registrar retirada"}
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Fechar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  {modal === "abertura" ? "Valor em caixa (R$)" : "Valor da retirada (R$)"}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                  <input
                    type="number" min="0.01" step="0.01" required
                    value={form.valor}
                    onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                    className="w-full pl-9 pr-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Descrição{modal === "saida" && <span className="text-red-400 ml-1">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={
                    modal === "abertura"
                      ? "Ex: Abertura do caixa"
                      : "Ex: Pagamento fornecedor"
                  }
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-50 ${
                    modal === "saida"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {saving ? "Salvando…" : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Saldo atual ───────────────────────────────────────────────────── */}
      <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Caixa</h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Saldo atual em caixa</p>
            <p
              className={`text-3xl font-bold tabular-nums ${
                saldoCaixa < 0 ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {fmt(saldoCaixa)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openModal("abertura")}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-cp-elevated hover:bg-cp-border border border-cp-border rounded-xl transition-all"
            >
              Saldo inicial
            </button>
            <button
              onClick={() => openModal("saida")}
              className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all"
            >
              Registrar retirada
            </button>
          </div>
        </div>
      </div>

      {/* ── Histórico de movimentações ────────────────────────────────────── */}
      <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Movimentações do caixa
        </h2>

        {movimentacoes.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">
            Nenhuma movimentação ainda. Use o botão "Saldo inicial" para começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-cp-border">
                  <th className="text-left pb-3 pr-4">Data / Hora</th>
                  <th className="text-left pb-3 px-4">Tipo</th>
                  <th className="text-left pb-3 px-4">Descrição</th>
                  <th className="text-right pb-3 px-4">Valor</th>
                  <th className="text-right pb-3 pl-4">Saldo após</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cp-border">
                {movimentacoesVisiveis.map((m) => {
                  const badge    = BADGE[m.tipo] ?? BADGE.entrada;
                  const isEntrada = m.tipo !== "saida";
                  return (
                    <tr key={m.id} className="hover:bg-cp-elevated transition-colors">
                      <td className="py-3 pr-4 text-gray-500 whitespace-nowrap text-xs tabular-nums">
                        {fmtDatetime(m.criado_em)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300 max-w-[220px] truncate">
                        {m.descricao}
                      </td>
                      <td
                        className={`py-3 px-4 text-right tabular-nums font-medium ${
                          isEntrada ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {isEntrada ? "+" : "−"}{fmt(m.valor)}
                      </td>
                      <td className="py-3 pl-4 text-right tabular-nums font-semibold text-white">
                        {fmt(m.saldo_apos)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {movimentacoes.length > LIMITE_VISIVEL && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setExpandido((v) => !v)}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-cp-elevated hover:bg-cp-border border border-cp-border rounded-xl transition-all"
            >
              {expandido ? "Ver menos" : `Ver mais (${movimentacoes.length - LIMITE_VISIVEL})`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
