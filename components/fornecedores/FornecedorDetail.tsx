"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registrarCompra, marcarCompraPaga } from "@/app/fornecedores/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Fornecedor = {
  id: string;
  nome: string;
  telefone: string | null;
  produtos_fornecidos: string | null;
  frequencia_entrega: string;
  observacoes: string | null;
};

type Compra = {
  id: string;
  data_entrega: string;
  descricao: string;
  valor: number;
  status_pagamento: "pago" | "a_pagar";
  data_vencimento: string | null;
};

type ProdutoOpcao = {
  id: string;
  nome: string;
  emoji: string | null;
  estoque: number | null;
};

type ItemCompra = {
  produto_id: string;
  quantidade: string;
};

// ── constantes ────────────────────────────────────────────────────────────────

const FREQUENCIA_LABEL: Record<string, string> = {
  diaria: "Diária", semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal",
};

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition [color-scheme:dark]";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function nomeMesAtual(hoje: string): string {
  const mes = Number(hoje.slice(5, 7));
  return MESES_PT[mes - 1];
}

function statusBadge(c: Compra, hoje: string) {
  if (c.status_pagamento === "pago")
    return { label: "Pago", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  if (c.data_vencimento && c.data_vencimento < hoje)
    return { label: "Vencido", cls: "text-red-400 bg-red-500/10 border-red-500/20" };
  return { label: "A pagar", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
}

// ── componente ────────────────────────────────────────────────────────────────

export default function FornecedorDetail({
  fornecedor,
  compras,
  produtos,
  totalMes,
  totalAberto,
  hoje,
}: {
  fornecedor: Fornecedor;
  compras: Compra[];
  produtos: ProdutoOpcao[];
  totalMes: number;
  totalAberto: number;
  hoje: string;
}) {
  const router = useRouter();

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    data_entrega: hoje,
    descricao: "",
    valor: "",
    status_pagamento: "a_pagar" as "pago" | "a_pagar",
    data_vencimento: hoje,
  });
  const [itens, setItens] = useState<ItemCompra[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");

  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  function openModal() {
    setForm({ data_entrega: hoje, descricao: "", valor: "", status_pagamento: "a_pagar", data_vencimento: hoje });
    setItens([]);
    setProdutoParaAdicionar("");
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const produtosDisponiveisParaAdicionar = produtos.filter(
    (p) => !itens.some((i) => i.produto_id === p.id)
  );

  function addItem() {
    if (!produtoParaAdicionar) return;
    setItens((prev) => [...prev, { produto_id: produtoParaAdicionar, quantidade: "1" }]);
    setProdutoParaAdicionar("");
  }

  function removeItem(produtoId: string) {
    setItens((prev) => prev.filter((i) => i.produto_id !== produtoId));
  }

  function setItemQuantidade(produtoId: string, quantidade: string) {
    setItens((prev) => prev.map((i) => (i.produto_id === produtoId ? { ...i, quantidade } : i)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const valor = parseFloat(form.valor);
    if (!form.descricao.trim() && itens.length === 0) {
      setFormError("Descreva os itens recebidos ou selecione ao menos um produto.");
      return;
    }
    if (!valor || valor <= 0) {
      setFormError("Informe um valor válido maior que zero.");
      return;
    }
    if (itens.some((i) => !parseInt(i.quantidade) || parseInt(i.quantidade) <= 0)) {
      setFormError("Informe uma quantidade válida para cada produto adicionado.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const { error } = await registrarCompra(fornecedor.id, {
      data_entrega: form.data_entrega,
      descricao: form.descricao,
      valor,
      status_pagamento: form.status_pagamento,
      data_vencimento: form.status_pagamento === "a_pagar" ? form.data_vencimento : null,
      itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: parseInt(i.quantidade) })),
    });

    if (error) {
      setSaving(false);
      setFormError(error);
      return;
    }

    setSaving(false);
    setShowModal(false);
    router.refresh();
  }

  async function handleMarcarPaga(compraId: string) {
    setPayingId(compraId);
    await marcarCompraPaga(compraId, fornecedor.id);
    setPayingId(null);
    router.refresh();
  }

  return (
    <>
      {/* Cabeçalho */}
      <div className="mb-8">
        <Link
          href="/fornecedores"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Fornecedores
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{fornecedor.nome}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-400/10 text-blue-300 border-blue-400/20">
                {FREQUENCIA_LABEL[fornecedor.frequencia_entrega] ?? fornecedor.frequencia_entrega}
              </span>
            </div>
            {fornecedor.telefone && (
              <p className="text-sm text-gray-500 mt-1">{fornecedor.telefone}</p>
            )}
            {fornecedor.produtos_fornecidos && (
              <p className="text-sm text-gray-400 mt-1">{fornecedor.produtos_fornecidos}</p>
            )}
            {fornecedor.observacoes && (
              <p className="text-xs text-gray-600 mt-1">{fornecedor.observacoes}</p>
            )}
          </div>

          <button
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all text-sm whitespace-nowrap shrink-0"
          >
            <span className="text-base leading-none">+</span>
            Registrar Compra
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Total comprado em {nomeMesAtual(hoje)}
          </p>
          <p className="text-2xl font-bold text-orange-400 tabular-nums">{fmt(totalMes)}</p>
        </div>
        <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Total em aberto (a pagar)
          </p>
          <p className={`text-2xl font-bold tabular-nums ${totalAberto > 0 ? "text-red-400" : "text-gray-500"}`}>
            {fmt(totalAberto)}
          </p>
        </div>
      </div>

      {/* Histórico de compras */}
      <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Histórico de compras
        </h2>

        {compras.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">Nenhuma compra registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-cp-border">
                  <th className="text-left pb-3 pr-4">Entrega</th>
                  <th className="text-left pb-3 px-4">Itens</th>
                  <th className="text-right pb-3 px-4">Valor</th>
                  <th className="text-left pb-3 px-4">Status</th>
                  <th className="text-right pb-3 pl-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cp-border">
                {compras.map((c) => {
                  const badge = statusBadge(c, hoje);
                  return (
                    <tr key={c.id} className="hover:bg-cp-elevated transition-colors">
                      <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">
                        {fmtDate(c.data_entrega)}
                      </td>
                      <td className="py-3 px-4 text-gray-300 max-w-xs truncate">{c.descricao}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-orange-400 whitespace-nowrap">
                        {fmt(c.valor)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {c.status_pagamento === "a_pagar" && c.data_vencimento && (
                          <span className="ml-2 text-[11px] text-gray-600 whitespace-nowrap">
                            vence {fmtDate(c.data_vencimento)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        {c.status_pagamento === "a_pagar" && (
                          <button
                            onClick={() => handleMarcarPaga(c.id)}
                            disabled={payingId === c.id}
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition"
                          >
                            {payingId === c.id ? "Marcando..." : "Marcar como pago"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de registrar compra */}
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
              <h3 className="font-semibold text-white">Registrar Compra</h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Data da entrega</label>
                <input
                  type="date"
                  value={form.data_entrega}
                  onChange={(e) => set("data_entrega", e.target.value)}
                  max={hoje}
                  className={inputCls}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Itens recebidos {itens.length > 0 && <span className="text-gray-600 font-normal">(opcional)</span>}
                </label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Ex: 5 caixas de refrigerante, 10kg de pão de queijo"
                  autoFocus
                  required={itens.length === 0}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Produtos comprados <span className="text-gray-600 font-normal">(opcional — atualiza o estoque)</span>
                </label>

                {itens.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {itens.map((item) => {
                      const produto = produtos.find((p) => p.id === item.produto_id);
                      if (!produto) return null;
                      return (
                        <div
                          key={item.produto_id}
                          className="flex items-center gap-2 bg-cp-elevated border border-cp-border rounded-lg px-3 py-2"
                        >
                          <span className="text-lg leading-none shrink-0">{produto.emoji ?? "🍽️"}</span>
                          <span className="flex-1 min-w-0 text-sm text-white truncate">{produto.nome}</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantidade}
                            onChange={(e) => setItemQuantidade(item.produto_id, e.target.value)}
                            className="w-16 px-2 py-1 rounded-md bg-cp-surface border border-cp-border text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(item.produto_id)}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {produtosDisponiveisParaAdicionar.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={produtoParaAdicionar}
                      onChange={(e) => setProdutoParaAdicionar(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Selecione um produto...</option>
                      {produtosDisponiveisParaAdicionar.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.emoji ?? "🍽️"} {p.nome} (estoque: {p.estoque ?? 0})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addItem}
                      disabled={!produtoParaAdicionar}
                      className="shrink-0 px-4 rounded-lg border border-cp-border text-gray-300 hover:text-white hover:border-cp-muted disabled:opacity-40 transition text-sm font-medium"
                    >
                      + Adicionar
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Valor total (R$)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.valor}
                    onChange={(e) => set("valor", e.target.value)}
                    className={`${inputCls} pl-9`}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Status de pagamento</label>
                <div className="flex gap-2">
                  {(["a_pagar", "pago"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => set("status_pagamento", status)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                        form.status_pagamento === status
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-cp-border bg-cp-elevated text-gray-400 hover:border-cp-muted"
                      }`}
                    >
                      {status === "pago" ? "Pago" : "A pagar"}
                    </button>
                  ))}
                </div>
              </div>

              {form.status_pagamento === "a_pagar" && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Data de vencimento</label>
                  <input
                    type="date"
                    value={form.data_vencimento}
                    onChange={(e) => set("data_vencimento", e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>
              )}

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
                    "Salvar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
