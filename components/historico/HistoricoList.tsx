"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cancelarPedido } from "@/app/historico/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type ItemPedido = {
  nome_produto: string | null;
  quantidade: number;
  preco_unitario: number;
  produtos: { nome: string } | null;
};

type Pedido = {
  id: string;
  criado_em: string;
  total: number;
  status: string;
  cancelado_por_nome: string | null;
  cancelado_em: string | null;
  alunos: { nome: string; turma: string | null; tipo_conta: string | null } | null;
  itens_pedido: ItemPedido[];
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function formatHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function formatHoraExata(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function resumoItens(itens: ItemPedido[]): string {
  const n = itens.reduce((s, i) => s + i.quantidade, 0);
  return n === 1 ? "1 item" : `${n} itens`;
}

function tipoBadge(tipo: string | null) {
  if (tipo === "fiado")
    return { label: "Fiado",   cls: "bg-amber-400/10 text-amber-400 border-amber-400/20" };
  if (tipo === "credito")
    return { label: "Crédito", cls: "bg-blue-400/10  text-blue-400  border-blue-400/20"  };
  return   { label: "—",       cls: "bg-gray-400/10  text-gray-500  border-gray-400/20"  };
}

// ── grid ──────────────────────────────────────────────────────────────────────

const GRID = "grid-cols-[80px_1fr_90px_120px_100px_80px_28px]";

// ── componente ────────────────────────────────────────────────────────────────

export default function HistoricoList({
  initialPedidos,
  dataAtual,
}: {
  initialPedidos: Pedido[];
  dataAtual: string;
}) {
  const router = useRouter();
  const [search,      setSearch]      = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const turmas = useMemo(() => {
    const set = new Set<string>();
    initialPedidos.forEach((p) => { if (p.alunos?.turma) set.add(p.alunos.turma); });
    return Array.from(set).sort();
  }, [initialPedidos]);

  const filtered = useMemo(() => {
    return initialPedidos.filter((p) => {
      const nome  = p.alunos?.nome?.toLowerCase() ?? "";
      const turma = p.alunos?.turma ?? "";
      return (
        nome.includes(search.toLowerCase()) &&
        (turmaFiltro === "todas" || turma === turmaFiltro)
      );
    });
  }, [initialPedidos, search, turmaFiltro]);

  const totalGeral = useMemo(
    () =>
      filtered
        .filter((p) => p.status !== "cancelado")
        .reduce((s, p) => s + (p.total ?? 0), 0),
    [filtered]
  );

  const isHoje = dataAtual === new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const [pedidoParaCancelar, setPedidoParaCancelar] = useState<Pedido | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function abrirCancelamento(p: Pedido) {
    setCancelError(null);
    setPedidoParaCancelar(p);
  }

  async function confirmarCancelamento() {
    if (!pedidoParaCancelar) return;
    setCancelling(true);
    setCancelError(null);

    const { error } = await cancelarPedido(pedidoParaCancelar.id);

    if (error) {
      setCancelError(error);
      setCancelling(false);
      return;
    }

    setCancelling(false);
    setPedidoParaCancelar(null);
    router.refresh();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="date"
          value={dataAtual}
          max={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}
          onChange={(e) => { if (e.target.value) router.push(`/historico?data=${e.target.value}`); }}
          className="px-4 py-2 rounded-lg bg-cp-elevated border border-cp-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition min-w-[160px] [color-scheme:dark]"
        />
        <input
          type="search"
          placeholder="Buscar por aluno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
        />
        <select
          value={turmaFiltro}
          onChange={(e) => setTurmaFiltro(e.target.value)}
          className="px-4 py-2 rounded-lg bg-cp-elevated border border-cp-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition min-w-[160px]"
        >
          <option value="todas">Todas as turmas</option>
          {turmas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Totalizador */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 mb-4 rounded-xl bg-cp-surface border border-cp-border">
          <span className="text-sm text-gray-400">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
            {turmaFiltro !== "todas" || search
              ? " (filtrado)"
              : isHoje
              ? " hoje"
              : ` em ${dataAtual.split("-").reverse().join("/")}`}
          </span>
          <span className="text-sm font-bold text-orange-400 tabular-nums">{fmt(totalGeral)}</span>
        </div>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">{search || turmaFiltro !== "todas" ? "🔍" : "📋"}</span>
          <p className="text-gray-400 font-medium">
            {search || turmaFiltro !== "todas"
              ? "Nenhum pedido encontrado para este filtro."
              : isHoje
              ? "Nenhum pedido registrado hoje ainda."
              : `Nenhum pedido em ${dataAtual.split("-").reverse().join("/")}.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-cp-border overflow-hidden">
          {/* Header */}
          <div className={`hidden md:grid ${GRID} gap-4 px-5 py-3 bg-cp-elevated border-b border-cp-border text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
            <span>Hora</span>
            <span>Aluno</span>
            <span>Turma</span>
            <span>Itens</span>
            <span className="text-right">Total</span>
            <span>Tipo</span>
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-cp-border">
            {filtered.map((p) => {
              const isCancelado = p.status === "cancelado";
              const badge = isCancelado
                ? { label: "Cancelado", cls: "bg-red-500/10 text-red-400 border-red-500/30" }
                : tipoBadge(p.alunos?.tipo_conta ?? null);
              const isExpanded = expandedId === p.id;

              return (
                <div key={p.id}>
                  {/* ── linha clicável ── */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleExpand(p.id)}
                    className={`grid grid-cols-1 md:grid ${GRID} gap-1 md:gap-4 px-5 py-4 cursor-pointer select-none transition-colors ${
                      isCancelado ? "opacity-50" : ""
                    } ${
                      isExpanded ? "bg-cp-elevated" : "bg-cp-surface hover:bg-cp-elevated"
                    }`}
                  >
                    {/* Hora */}
                    <span className="text-sm tabular-nums text-gray-400 font-mono">
                      {formatHora(p.criado_em)}
                    </span>

                    {/* Aluno */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {p.alunos?.nome ?? "—"}
                      </p>
                      {/* turma + tipo no mobile */}
                      <div className="flex items-center gap-2 mt-0.5 md:hidden">
                        <span className="text-xs text-gray-500">{p.alunos?.turma ?? "—"}</span>
                        <span className={`text-xs px-1.5 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {/* Turma (desktop) */}
                    <span className="hidden md:block text-sm text-gray-400 truncate self-center">
                      {p.alunos?.turma ?? "—"}
                    </span>

                    {/* Itens — resumo */}
                    <span className="text-sm text-gray-400 self-center">
                      {resumoItens(p.itens_pedido)}
                    </span>

                    {/* Total */}
                    <span
                      className={`md:text-right text-sm font-bold tabular-nums self-center ${
                        isCancelado ? "text-gray-500 line-through" : "text-orange-400"
                      }`}
                    >
                      {fmt(p.total ?? 0)}
                    </span>

                    {/* Tipo (desktop) */}
                    <span className={`hidden md:inline-flex self-center text-xs px-2 py-0.5 rounded-full border w-fit ${badge.cls}`}>
                      {badge.label}
                    </span>

                    {/* Chevron */}
                    <span className="hidden md:flex items-center justify-center self-center text-gray-600">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>

                  {/* ── painel de detalhe ── */}
                  {isExpanded && (
                    <div className="px-5 py-5 bg-cp-elevated/60 border-t border-cp-border/40">
                      <div className="max-w-xl">
                        {/* Cabeçalho do detalhe */}
                        <div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="font-mono">{formatHoraExata(p.criado_em)}</span>
                          <span className={`px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>

                        {/* Lista de itens */}
                        <div className="rounded-xl border border-cp-border overflow-hidden">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2 bg-cp-surface border-b border-cp-border text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            <span>Produto</span>
                            <span className="text-right">Qtd × Preço</span>
                            <span className="text-right">Subtotal</span>
                          </div>
                          {p.itens_pedido.map((item, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2.5 bg-cp-surface/50 text-sm border-b border-cp-border/40 last:border-0"
                            >
                              <span className="text-white truncate">
                                {item.nome_produto || item.produtos?.nome || "—"}
                              </span>
                              <span className="text-gray-400 tabular-nums text-right whitespace-nowrap">
                                {item.quantidade} × {fmt(item.preco_unitario)}
                              </span>
                              <span className="text-gray-300 tabular-nums text-right font-medium">
                                {fmt(item.quantidade * item.preco_unitario)}
                              </span>
                            </div>
                          ))}
                          {/* Total */}
                          <div className="grid grid-cols-[1fr_auto] gap-x-6 px-4 py-2.5 bg-cp-elevated border-t border-cp-border">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide self-center">
                              Total do pedido
                            </span>
                            <span
                              className={`text-sm font-bold tabular-nums text-right ${
                                isCancelado ? "text-gray-500 line-through" : "text-orange-400"
                              }`}
                            >
                              {fmt(p.total ?? 0)}
                            </span>
                          </div>
                        </div>

                        {/* Ação de cancelamento / info de cancelamento */}
                        {isCancelado ? (
                          <p className="mt-4 text-xs text-gray-500">
                            Cancelado por{" "}
                            <span className="text-gray-400 font-medium">
                              {p.cancelado_por_nome ?? "—"}
                            </span>
                            {p.cancelado_em && ` às ${formatHoraExata(p.cancelado_em)}`}
                          </p>
                        ) : isHoje ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirCancelamento(p);
                            }}
                            className="mt-4 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
                          >
                            Cancelar venda
                          </button>
                        ) : (
                          <p className="mt-4 text-xs text-gray-600">
                            Só é possível cancelar vendas no mesmo dia.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Rodapé com total geral */}
          <div className="flex items-center justify-between px-5 py-3 bg-cp-elevated border-t border-cp-border">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Total{turmaFiltro !== "todas" || search ? " (filtrado)" : ""}
            </span>
            <span className="text-sm font-bold text-orange-400 tabular-nums">{fmt(totalGeral)}</span>
          </div>
        </div>
      )}

      {/* ── modal de confirmação de cancelamento ── */}
      {pedidoParaCancelar && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-5"
          onClick={() => !cancelling && setPedidoParaCancelar(null)}
        >
          <div
            className="w-full max-w-sm bg-cp-surface border border-cp-border rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-2">Cancelar venda?</h2>
            <p className="text-sm text-gray-400 leading-snug mb-4">
              A venda de{" "}
              <span className="text-white font-medium">
                {pedidoParaCancelar.alunos?.nome ?? "—"}
              </span>{" "}
              no valor de{" "}
              <span className="text-white font-medium">{fmt(pedidoParaCancelar.total ?? 0)}</span>{" "}
              será marcada como cancelada e o valor será estornado ao saldo do aluno. Esta ação
              não pode ser desfeita.
            </p>

            {cancelError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs text-red-400 text-center">
                {cancelError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPedidoParaCancelar(null)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl font-semibold text-sm border-2 border-cp-border text-gray-400 hover:text-white hover:border-cp-muted transition-colors disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-red-500 hover:bg-red-600 active:scale-[.98] text-white transition-all disabled:opacity-60"
              >
                {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
