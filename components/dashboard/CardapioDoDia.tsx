"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { salvarCardapioDoDia } from "@/app/dashboard/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type ProdutoDisponivel = {
  id: string;
  nome: string;
  emoji: string;
  categoria: string | null;
  estoque: number;
};

type ItemCardapio = {
  produto_id: string;
  nome: string;
  emoji: string;
  quantidade_disponivel: number;
  vendido: number;
  sobrou: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

function formatDataCardapio(hoje: string): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const weekday = cap(new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date));
  const month   = cap(new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date));
  return `${weekday}, ${String(d).padStart(2, "0")} de ${month}`;
}

function restanteInfo(disponivel: number, sobrou: number) {
  const percent = disponivel > 0 ? Math.max(0, Math.min(100, (sobrou / disponivel) * 100)) : 0;

  let barCls = "bg-red-500";
  let textCls = "text-red-400";
  if (percent > 50)      { barCls = "bg-emerald-500"; textCls = "text-emerald-400"; }
  else if (percent > 20) { barCls = "bg-amber-400";   textCls = "text-amber-400";   }

  const label =
    sobrou < 0 ? `vendeu ${Math.abs(sobrou)} a mais que o previsto`
    : sobrou === 0 ? "esgotado"
    : `restam ${sobrou}`;

  return { percent, barCls, textCls, label };
}

// ── componente ────────────────────────────────────────────────────────────────

export default function CardapioDoDia({
  hoje,
  produtosDisponiveis,
  cardapioAtual,
}: {
  hoje: string;
  produtosDisponiveis: ProdutoDisponivel[];
  cardapioAtual: ItemCardapio[];
}) {
  const router = useRouter();

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  function openModal() {
    const inicial: Record<string, string> = {};
    for (const item of cardapioAtual) {
      inicial[item.produto_id] = String(item.quantidade_disponivel);
    }
    setSelecionados(inicial);
    setSearch("");
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  function toggleProduto(id: string) {
    setSelecionados((prev) => {
      if (id in prev) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: "1" };
    });
  }

  function setQuantidade(id: string, valor: string) {
    setSelecionados((prev) => ({ ...prev, [id]: valor }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const itens = Object.entries(selecionados).map(([produto_id, quantidade]) => ({
      produto_id,
      quantidade_disponivel: parseInt(quantidade) || 0,
    }));

    if (itens.some((i) => i.quantidade_disponivel <= 0)) {
      setFormError("Informe uma quantidade válida para cada produto selecionado.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const { error } = await salvarCardapioDoDia(hoje, itens);

    if (error) {
      setSaving(false);
      setFormError(error);
      return;
    }

    setSaving(false);
    setShowModal(false);
    router.refresh();
  }

  const produtosFiltrados = produtosDisponiveis.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  const qtdSelecionados = Object.keys(selecionados).length;

  const dataFormatada = formatDataCardapio(hoje);

  return (
    <section>
      {cardapioAtual.length === 0 ? (
        <div className="bg-cp-surface border border-orange-500/20 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl">
              🍱
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Definir cardápio de hoje</p>
              <p className="text-gray-500 text-xs mt-0.5 capitalize">{dataFormatada}</p>
              <p className="text-gray-500 text-xs mt-1">
                Escolha os salgados que serão vendidos hoje e a quantidade disponível de cada um.
              </p>
            </div>
          </div>
          <button
            onClick={openModal}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all text-sm whitespace-nowrap"
          >
            <span className="text-base leading-none">+</span>
            Definir Cardápio do Dia
          </button>
        </div>
      ) : (
        <div className="bg-cp-surface border border-orange-500/20 rounded-2xl p-5 shadow-lg shadow-orange-500/5">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                🍽️ Cardápio de Hoje
              </h3>
              <p className="text-gray-500 text-xs mt-1 capitalize">{dataFormatada}</p>
            </div>
            <button
              onClick={openModal}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-orange-400 border border-cp-border hover:border-orange-500/40 rounded-lg px-3 py-1.5 transition"
            >
              ✏️ Editar Cardápio
            </button>
          </div>

          <div className="space-y-3">
            {cardapioAtual.map((item) => {
              const info = restanteInfo(item.quantidade_disponivel, item.sobrou);
              return (
                <div
                  key={item.produto_id}
                  className="rounded-xl border border-cp-border bg-cp-elevated px-4 py-3"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl leading-none shrink-0">{item.emoji}</span>
                    <p className="flex-1 min-w-0 text-sm font-medium text-white truncate">{item.nome}</p>
                    <span className={`shrink-0 text-xs font-semibold ${info.textCls}`}>{info.label}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
                    <span>Disponível: {item.quantidade_disponivel}</span>
                    <span>Vendido: {item.vendido}</span>
                  </div>

                  <div className="h-2 rounded-full bg-cp-surface overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${info.barCls}`}
                      style={{ width: `${info.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de definição do cardápio */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-cp-border sticky top-0 bg-cp-surface z-10">
              <h3 className="font-semibold text-white">Cardápio do Dia</h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <input
                  type="search"
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={inputCls}
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-gray-600">
                  {qtdSelecionados} produto{qtdSelecionados !== 1 ? "s" : ""} selecionado{qtdSelecionados !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {produtosFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-6">Nenhum produto encontrado.</p>
                ) : (
                  produtosFiltrados.map((p) => {
                    const checked = p.id in selecionados;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
                          checked ? "border-orange-500/50 bg-orange-500/5" : "border-cp-border bg-cp-elevated"
                        }`}
                      >
                        <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduto(p.id)}
                            className="w-4 h-4 accent-orange-500 shrink-0"
                          />
                          <span className="text-lg leading-none shrink-0">{p.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-white truncate">{p.nome}</span>
                            <span className="block text-xs text-gray-500">estoque: {p.estoque}</span>
                          </span>
                        </label>
                        {checked && (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={selecionados[p.id]}
                            onChange={(e) => setQuantidade(p.id, e.target.value)}
                            className="w-16 px-2 py-1.5 rounded-md bg-cp-surface border border-cp-border text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500 shrink-0"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {formError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-lg border border-cp-border text-gray-400 hover:text-white hover:border-cp-muted text-sm font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Cardápio"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
