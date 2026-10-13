"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { RelatorioData } from "@/app/relatorios/page";

const VendasChart = dynamic(() => import("./VendasChart"), {
  ssr: false,
  loading: () => <div className="h-[220px] rounded-xl bg-cp-elevated animate-pulse" />,
});

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

export default function RelatoriosView({ data }: { data: RelatorioData }) {
  const router = useRouter();

  function setPeriodo(p: "semanal" | "mensal") {
    router.push(`/relatorios?periodo=${p}`);
  }

  const {
    periodo, periodoLabel,
    totalArrecadado, totalPedidos, ticketMedio,
    vendasPorDia, top5Alunos, topProdutos,
  } = data;

  return (
    <div className="space-y-10">

      {/* ── Seletor de período ── */}
      <div className="flex items-center gap-2">
        {(["semanal", "mensal"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              periodo === p
                ? "bg-orange-500/15 border-orange-500/50 text-orange-400"
                : "bg-cp-elevated border-cp-border text-gray-400 hover:text-gray-200 hover:border-cp-muted"
            }`}
          >
            {p === "semanal" ? "Semanal" : "Mensal"}
          </button>
        ))}
        <span className="ml-2 text-xs text-gray-600">{periodoLabel}</span>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* FINANCEIRO                                                */}
      {/* ══════════════════════════════════════════════════════════ */}
      <section>
        <SectionTitle>Financeiro</SectionTitle>

        {/* Cards de métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <MetricCard
            label="Total arrecadado"
            value={fmt(totalArrecadado)}
            sub={`${periodoLabel}`}
          />
          <MetricCard
            label="Total de pedidos"
            value={String(totalPedidos)}
            sub="pedidos confirmados"
          />
          <MetricCard
            label="Ticket médio"
            value={fmt(ticketMedio)}
            sub="por pedido"
          />
        </div>

        {/* Gráfico de barras */}
        <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 pt-5 pb-3 mb-6">
          <p className="text-sm font-semibold text-white mb-4">Vendas por dia</p>
          <VendasChart data={vendasPorDia} />
        </div>

        {/* Top 5 Alunos */}
        <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-cp-border">
            <p className="text-sm font-semibold text-white">Top 5 Alunos — maior consumo</p>
          </div>
          {top5Alunos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-600">
              Nenhum pedido no período.
            </div>
          ) : (
            <div className="divide-y divide-cp-border">
              {top5Alunos.map((a, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-cp-elevated transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-amber-400/20 text-amber-400" :
                    i === 1 ? "bg-gray-400/15  text-gray-400"  :
                    i === 2 ? "bg-orange-700/20 text-orange-600" :
                              "bg-cp-elevated text-gray-600"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{a.nome}</p>
                    <p className="text-xs text-gray-500">{a.turma ?? "—"}</p>
                  </div>
                  <span className="text-sm font-bold text-orange-400 tabular-nums shrink-0">
                    {fmt(a.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PRODUTOS                                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      <section>
        <SectionTitle>Produtos</SectionTitle>

        {/* Produtos mais vendidos */}
        <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-cp-border">
            <p className="text-sm font-semibold text-white">Produtos mais vendidos</p>
          </div>
          {topProdutos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-600">
              Nenhum produto vendido no período.
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_80px_120px] gap-4 px-5 py-2.5 bg-cp-elevated border-b border-cp-border text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <span>Produto</span>
                <span className="text-right">Qtd.</span>
                <span className="text-right">Receita</span>
              </div>
              <div className="divide-y divide-cp-border">
                {topProdutos.map((p, i) => {
                  const maxQtd = topProdutos[0].qtd;
                  return (
                    <div key={i} className="px-5 py-3 hover:bg-cp-elevated transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-4 tabular-nums shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 mb-1">
                            <p className="text-sm font-medium text-white truncate">{p.nome}</p>
                            <div className="hidden md:flex items-center gap-6 shrink-0 tabular-nums">
                              <span className="text-sm text-gray-400 w-14 text-right">{p.qtd} un.</span>
                              <span className="text-sm font-semibold text-orange-400 w-24 text-right">{fmt(p.receita)}</span>
                            </div>
                          </div>
                          {/* barra de progresso */}
                          <div className="h-1 rounded-full bg-cp-elevated overflow-hidden">
                            <div
                              className="h-full rounded-full bg-orange-500/60"
                              style={{ width: `${Math.round((p.qtd / maxQtd) * 100)}%` }}
                            />
                          </div>
                          {/* mobile: qtd + receita */}
                          <div className="flex items-center gap-3 mt-1 md:hidden">
                            <span className="text-xs text-gray-500">{p.qtd} un.</span>
                            <span className="text-xs font-semibold text-orange-400">{fmt(p.receita)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
