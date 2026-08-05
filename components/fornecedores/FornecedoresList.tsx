"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createFornecedor } from "@/app/fornecedores/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Fornecedor = {
  id: string;
  nome: string;
  telefone: string | null;
  produtos_fornecidos: string | null;
  frequencia_entrega: string;
  observacoes: string | null;
};

type Alerta = {
  id: string;
  valor: number;
  data_vencimento: string | null;
  descricao: string;
  fornecedores: { nome: string } | null;
};

// ── constantes ────────────────────────────────────────────────────────────────

const FREQUENCIAS = [
  { value: "diaria",    label: "Diária"    },
  { value: "semanal",   label: "Semanal"   },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal",    label: "Mensal"    },
] as const;

const FREQUENCIA_LABEL: Record<string, string> = Object.fromEntries(
  FREQUENCIAS.map((f) => [f.value, f.label])
);

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
}

// ── componente ────────────────────────────────────────────────────────────────

export default function FornecedoresList({
  initialFornecedores,
  totalPorFornecedor,
  totalGeralMes,
  alertas,
}: {
  initialFornecedores: Fornecedor[];
  totalPorFornecedor: Record<string, number>;
  totalGeralMes: number;
  alertas: Alerta[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "", telefone: "", produtos_fornecidos: "",
    frequencia_entrega: "semanal" as (typeof FREQUENCIAS)[number]["value"],
    observacoes: "",
  });

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  const filtered = useMemo(
    () => initialFornecedores.filter((f) => f.nome.toLowerCase().includes(search.toLowerCase())),
    [initialFornecedores, search]
  );

  function openModal() {
    setForm({ nome: "", telefone: "", produtos_fornecidos: "", frequencia_entrega: "semanal", observacoes: "" });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setFormError("Informe o nome do fornecedor.");
      return;
    }
    setSaving(true);
    setFormError(null);

    const { error } = await createFornecedor(form);

    if (error) {
      setSaving(false);
      setFormError(error);
      return;
    }

    setSaving(false);
    setShowModal(false);
    router.refresh();
  }

  return (
    <>
      {/* Resumo do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Total gasto este mês
          </p>
          <p className="text-2xl font-bold text-orange-400 tabular-nums">{fmt(totalGeralMes)}</p>
          <p className="text-xs text-gray-600 mt-0.5">em compras de todos os fornecedores</p>
        </div>
        <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Vencendo nos próximos 3 dias
          </p>
          <p className={`text-2xl font-bold tabular-nums ${alertas.length > 0 ? "text-red-400" : "text-gray-500"}`}>
            {alertas.length}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">conta{alertas.length !== 1 ? "s" : ""} a pagar</p>
        </div>
      </div>

      {/* Alertas de vencimento */}
      {alertas.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Contas a vencer
            </h2>
            <span className="text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
              {alertas.length}
            </span>
          </div>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5"
              >
                <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 text-sm">
                  ⚠️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {a.fornecedores?.nome ?? "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{a.descricao}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(a.valor)}</p>
                  {a.data_vencimento && (
                    <p className="text-[11px] text-gray-600 mt-0.5">vence {fmtDate(a.data_vencimento)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          placeholder="Buscar fornecedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
        />
        <button
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold px-5 py-2 rounded-lg shadow-lg shadow-orange-500/20 transition-all text-sm whitespace-nowrap"
        >
          <span className="text-base leading-none">+</span>
          Novo Fornecedor
        </button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">{search ? "🔍" : "🚚"}</span>
          <p className="text-gray-400 font-medium">
            {search ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado ainda."}
          </p>
          {!search && (
            <button
              onClick={openModal}
              className="mt-4 text-orange-400 hover:text-orange-300 text-sm font-medium transition"
            >
              + Cadastrar o primeiro fornecedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <Link
              key={f.id}
              href={`/fornecedores/${f.id}`}
              className="bg-cp-surface border border-cp-border rounded-2xl p-5 flex flex-col gap-3 hover:border-cp-muted transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{f.nome}</p>
                  {f.telefone && <p className="text-xs text-gray-500 mt-0.5">{f.telefone}</p>}
                </div>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-blue-400/10 text-blue-300 border-blue-400/20">
                  {FREQUENCIA_LABEL[f.frequencia_entrega] ?? f.frequencia_entrega}
                </span>
              </div>

              {f.produtos_fornecidos && (
                <p className="text-sm text-gray-400 line-clamp-2">{f.produtos_fornecidos}</p>
              )}

              <div className="mt-auto pt-3 border-t border-cp-border flex items-center justify-between">
                <span className="text-xs text-gray-500">Este mês</span>
                <span className="text-sm font-bold text-orange-400 tabular-nums">
                  {fmt(totalPorFornecedor[f.id] ?? 0)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal de cadastro */}
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
              <h3 className="font-semibold text-white">Novo Fornecedor</h3>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  className={inputCls}
                  placeholder="Ex: Distribuidora Sabor & Cia"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Telefone/WhatsApp</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  className={inputCls}
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Produto(s) que fornece</label>
                <textarea
                  value={form.produtos_fornecidos}
                  onChange={(e) => set("produtos_fornecidos", e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Ex: salgados, refrigerantes, pães"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Frequência de entrega</label>
                <select
                  value={form.frequencia_entrega}
                  onChange={(e) => set("frequencia_entrega", e.target.value)}
                  className={inputCls}
                >
                  {FREQUENCIAS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => set("observacoes", e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Opcional"
                />
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
