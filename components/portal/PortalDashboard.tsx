"use client";

import dynamic from "next/dynamic";
import { portalLogout, atualizarLimiteDiario } from "@/app/portal/login/actions";
import { useState } from "react";
import type { AlunoPortal, PedidoPortal, PagamentoPortal, WeeklyPoint } from "@/app/portal/dashboard/page";

const ConsumoChart = dynamic(() => import("./ConsumoChart"), {
  ssr: false,
  loading: () => <div className="h-[200px] rounded-xl bg-cp-elevated animate-pulse" />,
});

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

// ── períodos do histórico (datas YYYY-MM-DD no fuso de São Paulo) ──────────────

type Periodo = "semana_atual" | "mes_atual" | "mes_anterior" | "ultimos_30";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const HISTORICO_LIMITE = 5;

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toYMD(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
}

function diaMes(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

const ymdBR = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo",
});

function getPeriodo(tipo: Periodo, hoje: string): { inicio: string; fim: string; descricao: string } {
  const [y, m] = hoje.split("-").map(Number);

  if (tipo === "semana_atual") {
    const dow    = parseYMD(hoje).getUTCDay();
    const inicio = addDays(hoje, dow === 0 ? -6 : 1 - dow);
    return { inicio, fim: hoje, descricao: `${diaMes(inicio)} a ${diaMes(hoje)}` };
  }
  if (tipo === "mes_atual") {
    return { inicio: `${y}-${String(m).padStart(2, "0")}-01`, fim: hoje, descricao: `${MESES[m - 1]}/${y}` };
  }
  if (tipo === "mes_anterior") {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return {
      inicio:    `${py}-${String(pm).padStart(2, "0")}-01`,
      fim:       toYMD(new Date(Date.UTC(py, pm, 0))),
      descricao: `${MESES[pm - 1]}/${py}`,
    };
  }
  const inicio = addDays(hoje, -29);
  return { inicio, fim: hoje, descricao: `${diaMes(inicio)} a ${diaMes(hoje)}` };
}

function AlertaSaldoBaixo({ nome, saldo, tipoConta }: { nome: string; saldo: number; tipoConta: string }) {
  // Só crédito pré-pago: no fiado, saldo R$ 0,00 é conta em dia
  if (tipoConta !== "credito" || saldo >= 10) return null;
  return (
    <div className="flex gap-3 items-start rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3.5">
      <span className="text-xl shrink-0 mt-0.5">⚠️</span>
      <p className="text-sm text-yellow-300 leading-snug">
        <span className="font-semibold">Saldo baixo!</span> O saldo de{" "}
        <span className="font-semibold">{nome}</span> está em{" "}
        <span className="font-semibold tabular-nums">{fmt(saldo)}</span>.{" "}
        Recarregue para evitar bloqueio nas compras.
      </p>
    </div>
  );
}

function PedidoCard({ pedido }: { pedido: PedidoPortal }) {
  const nomeProduto = (item: PedidoPortal["itens_pedido"][number]) =>
    item.nome_produto || item.produtos?.nome || "Produto";

  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
      {/* cabeçalho do pedido */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cp-border bg-cp-elevated/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">{fmtDate(pedido.criado_em)}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{fmtTime(pedido.criado_em)}</span>
        </div>
        <span className="text-sm font-bold text-white tabular-nums">{fmt(pedido.total)}</span>
      </div>

      {/* itens */}
      <ul className="divide-y divide-cp-border/60">
        {pedido.itens_pedido.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-600 italic">Sem itens registrados</li>
        ) : (
          pedido.itens_pedido.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className="text-sm text-gray-300 flex-1 min-w-0 truncate">
                {nomeProduto(item)}
              </span>
              <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                × {item.quantidade}
              </span>
              <span className="text-sm text-gray-400 shrink-0 tabular-nums w-20 text-right">
                {fmt(item.quantidade * item.preco_unitario)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function fmtDateFull(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function PagamentosRealizados({ pagamentos }: { pagamentos: PagamentoPortal[] }) {
  const [expandido, setExpandido] = useState(false);
  const visiveis = expandido ? pagamentos : pagamentos.slice(0, HISTORICO_LIMITE);

  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-white">Pagamentos realizados</p>
      </div>

      {pagamentos.length === 0 ? (
        <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-10 text-center text-sm text-gray-600">
          Nenhum pagamento registrado.
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="bg-cp-surface border border-cp-border rounded-2xl divide-y divide-cp-border/60 overflow-hidden">
            {visiveis.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-300 tabular-nums">{fmtDateFull(p.criado_em)}</p>
                  {p.observacao && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{p.observacao}</p>
                  )}
                </div>
                <span className="text-sm font-bold text-white tabular-nums shrink-0">{fmt(Number(p.valor))}</span>
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/20">
                  Pago
                </span>
              </li>
            ))}
          </ul>

          {pagamentos.length > HISTORICO_LIMITE && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              className="w-full py-2.5 px-4 bg-cp-surface hover:bg-cp-elevated border border-cp-border text-sm font-medium text-gray-300 hover:text-white rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-bg"
            >
              {expandido ? "Ver menos" : `Ver mais (${pagamentos.length - HISTORICO_LIMITE})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ConfiguracoesSaldo({ limiteDiarioInicial }: { limiteDiarioInicial: number }) {
  const [limite,  setLimite]  = useState(limiteDiarioInicial);
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState<"idle" | "success" | "error">("idle");
  const [errMsg,  setErrMsg]  = useState("");

  async function handleSalvar() {
    setSaving(true);
    setStatus("idle");
    const result = await atualizarLimiteDiario(limite);
    setSaving(false);
    if (result.ok) {
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } else {
      setStatus("error");
      setErrMsg(result.error ?? "Erro ao salvar.");
    }
  }

  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Limite diário de consumo</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Define o valor máximo que seu filho pode gastar por dia na cantina.
        </p>
      </div>

      {/* Valor atual */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Limite atual</span>
        <span className={`text-lg font-bold tabular-nums ${limite === 0 ? "text-gray-500" : "text-white"}`}>
          {limite === 0 ? "Sem limite" : fmt(limite)}
        </span>
      </div>

      {/* Slider */}
      <div className="space-y-2">
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={limite}
          onChange={(e) => { setLimite(Number(e.target.value)); setStatus("idle"); }}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500 bg-cp-elevated"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>Sem limite</span>
          <span>R$ 50,00</span>
        </div>
      </div>

      {/* Feedback */}
      {status === "success" && (
        <p className="text-sm text-emerald-400 font-medium">Limite atualizado com sucesso!</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-400">{errMsg}</p>
      )}

      {/* Botão */}
      <button
        onClick={handleSalvar}
        disabled={saving}
        className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 text-white text-sm font-semibold rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-surface flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar limite"
        )}
      </button>
    </div>
  );
}

export default function PortalDashboard({
  aluno, pedidos, totalMes, weeklyData, hoje, responsavelNome, pagamentos,
}: {
  pagamentos:      PagamentoPortal[];
  aluno:           AlunoPortal;
  pedidos:         PedidoPortal[];
  totalMes:        number;
  weeklyData:      WeeklyPoint[];
  hoje:            string;
  responsavelNome: string | null;
}) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [periodo,    setPeriodo]    = useState<Periodo>("ultimos_30");
  const [expandido,  setExpandido]  = useState(false);

  const filtro = getPeriodo(periodo, hoje);
  const pedidosFiltrados = pedidos.filter((p) => {
    const d = ymdBR.format(new Date(p.criado_em));
    return d >= filtro.inicio && d <= filtro.fim;
  });
  const totalPeriodo     = pedidosFiltrados.reduce((s, p) => s + (p.total ?? 0), 0);
  const pedidosVisiveis  = expandido ? pedidosFiltrados : pedidosFiltrados.slice(0, HISTORICO_LIMITE);

  const [hy, hm] = hoje.split("-").map(Number);
  const opcoesPeriodo: { id: Periodo; label: string }[] = [
    { id: "semana_atual", label: "Semana atual" },
    { id: "mes_atual",    label: `${MESES[hm - 1]}/${hy}` },
    { id: "mes_anterior", label: hm === 1 ? `${MESES[11]}/${hy - 1}` : `${MESES[hm - 2]}/${hy}` },
    { id: "ultimos_30",   label: "Últimos 30 dias" },
  ];

  function selecionarPeriodo(id: Periodo) {
    setPeriodo(id);
    setExpandido(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await portalLogout();
  }

  return (
    <div className="min-h-screen bg-cp-bg">

      {/* ── Header ── */}
      <header className="bg-cp-surface border-b border-cp-border px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-lg shrink-0">
              👨‍👩‍👧
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-white leading-tight truncate">
                {responsavelNome ? `Olá, ${responsavelNome}!` : "Olá!"}
              </p>
              <p className="text-sm text-gray-400 leading-tight mt-0.5 truncate">
                Acompanhando: <span className="text-gray-300">{aluno.nome}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-sm text-gray-400 hover:text-gray-200 transition disabled:opacity-50 px-3 py-1.5 rounded-lg hover:bg-cp-elevated shrink-0"
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto p-4 space-y-5">

        {/* Alerta de saldo baixo */}
        <AlertaSaldoBaixo nome={aluno.nome} saldo={aluno.saldo} tipoConta={aluno.tipo_conta} />

        {aluno.turma && (
          <p className="text-sm text-gray-500">
            Turma: <span className="text-gray-300 font-medium">{aluno.turma}</span>
          </p>
        )}

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-cp-surface border border-cp-border rounded-2xl px-4 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saldo atual</p>
            <p className={`text-2xl font-bold tabular-nums ${aluno.saldo < 0 ? "text-red-400" : aluno.tipo_conta === "credito" && aluno.saldo < 10 ? "text-yellow-400" : "text-emerald-400"}`}>
              {fmt(aluno.saldo)}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {aluno.tipo_conta === "fiado" ? "Conta fiado" : "Crédito pré-pago"}
            </p>
          </div>
          <div className="bg-cp-surface border border-cp-border rounded-2xl px-4 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gasto este mês</p>
            <p className="text-2xl font-bold text-white tabular-nums">{fmt(totalMes)}</p>
            <p className="text-xs text-gray-600 mt-0.5">mês atual</p>
          </div>
        </div>

        {/* Gráfico semanal */}
        <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 pt-5 pb-3">
          <p className="text-sm font-semibold text-white mb-4">Consumo semanal</p>
          <ConsumoChart data={weeklyData} />
        </div>

        {/* Histórico detalhado */}
        <div>
          <div className="mb-3 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Histórico de consumo</p>
                <p className="text-xs text-gray-500 mt-0.5">{filtro.descricao}</p>
              </div>
              {pedidosFiltrados.length > 0 && (
                <p className="text-xs text-gray-500 text-right shrink-0">
                  {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? "consumo" : "consumos"} ·{" "}
                  <span className="text-gray-300 font-semibold tabular-nums">{fmt(totalPeriodo)}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {opcoesPeriodo.map((op) => {
                const ativo = periodo === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => selecionarPeriodo(op.id)}
                    aria-pressed={ativo}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-bg ${
                      ativo
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-cp-surface border-cp-border text-gray-400 hover:text-gray-200 hover:bg-cp-elevated"
                    }`}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-10 text-center text-sm text-gray-600">
              Nenhum consumo no período.
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosVisiveis.map((p) => (
                <PedidoCard key={p.id} pedido={p} />
              ))}

              {pedidosFiltrados.length > HISTORICO_LIMITE && (
                <button
                  type="button"
                  onClick={() => setExpandido((v) => !v)}
                  className="w-full py-2.5 px-4 bg-cp-surface hover:bg-cp-elevated border border-cp-border text-sm font-medium text-gray-300 hover:text-white rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-cp-bg"
                >
                  {expandido
                    ? "Ver menos"
                    : `Ver mais (${pedidosFiltrados.length - HISTORICO_LIMITE})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pagamentos realizados */}
        <PagamentosRealizados pagamentos={pagamentos} />

        {/* Configurações */}
        <div>
          <div className="mb-3">
            <p className="text-sm font-semibold text-white">Configurações</p>
          </div>
          <ConfiguracoesSaldo limiteDiarioInicial={aluno.limite_diario ?? 0} />
        </div>

      </main>
    </div>
  );
}
