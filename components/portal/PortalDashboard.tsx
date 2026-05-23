"use client";

import dynamic from "next/dynamic";
import { portalLogout, atualizarLimiteDiario } from "@/app/portal/login/actions";
import { useState } from "react";
import type { AlunoPortal, PedidoPortal, WeeklyPoint } from "@/app/portal/dashboard/page";

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

function AlertaSaldoBaixo({ nome, saldo }: { nome: string; saldo: number }) {
  if (saldo >= 10) return null;
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
  aluno, pedidos, totalMes, weeklyData,
}: {
  aluno:      AlunoPortal;
  pedidos:    PedidoPortal[];
  totalMes:   number;
  weeklyData: WeeklyPoint[];
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await portalLogout();
  }

  return (
    <div className="min-h-screen bg-cp-bg">

      {/* ── Header ── */}
      <header className="bg-cp-surface border-b border-cp-border px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-sm shrink-0">
              👨‍👩‍👧
            </div>
            <div>
              <p className="text-[11px] text-gray-500 leading-none">Portal do Responsável</p>
              <p className="text-sm font-semibold text-white leading-tight">{aluno.nome}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-50 px-3 py-1.5 rounded-lg hover:bg-cp-elevated"
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto p-4 space-y-5">

        {/* Alerta de saldo baixo */}
        <AlertaSaldoBaixo nome={aluno.nome} saldo={aluno.saldo} />

        {aluno.turma && (
          <p className="text-sm text-gray-500">
            Turma: <span className="text-gray-300 font-medium">{aluno.turma}</span>
          </p>
        )}

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-cp-surface border border-cp-border rounded-2xl px-4 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saldo atual</p>
            <p className={`text-2xl font-bold tabular-nums ${aluno.saldo < 0 ? "text-red-400" : aluno.saldo < 10 ? "text-yellow-400" : "text-emerald-400"}`}>
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
          <div className="mb-3">
            <p className="text-sm font-semibold text-white">Histórico de consumo</p>
            <p className="text-xs text-gray-500 mt-0.5">últimos 30 dias</p>
          </div>

          {pedidos.length === 0 ? (
            <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-10 text-center text-sm text-gray-600">
              Nenhum consumo no período.
            </div>
          ) : (
            <div className="space-y-3">
              {pedidos.map((p) => (
                <PedidoCard key={p.id} pedido={p} />
              ))}
            </div>
          )}
        </div>

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
