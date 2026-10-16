"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarExtratoAluno, type PedidoExtrato } from "@/app/cobrancas/actions";
import {
  PERIODOS, getPeriodo, montarExtrato, todayBR, toBRDateStr, type Periodo,
} from "@/components/cobrancas/ExtratoDetalhadoModal";
import { WHATSAPP_ICON } from "@/components/cobrancas/CobrancasList";
import { baixarExtratoPdf } from "@/lib/extratoPdf";

// ── tipos ─────────────────────────────────────────────────────────────────────

export type AlunoFicha = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  tipo_conta: string | null;
  telefone_responsavel: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function rotuloDia(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function resumoItens(itens: { nome_produto: string; quantidade: number }[]): string {
  return itens
    .map((i) => (i.quantidade > 1 ? `${i.nome_produto} x${i.quantidade}` : i.nome_produto))
    .join(", ");
}

// ── componente ────────────────────────────────────────────────────────────────

export default function FichaAlunoModal({
  aluno,
  onClose,
}: {
  aluno: AlunoFicha;
  onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("semana_atual");
  const [pedidos, setPedidos] = useState<PedidoExtrato[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const hoje = useMemo(() => todayBR(), []);
  const tel = aluno.telefone_responsavel?.replace(/\D/g, "") ?? "";

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const result = await buscarExtratoAluno(aluno.id);
      if (cancelado) return;
      if (result.error) setError(result.error);
      else setPedidos(result.pedidos ?? []);
    })();
    return () => { cancelado = true; };
  }, [aluno.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const periodoAtual = useMemo(() => getPeriodo(periodo, hoje), [periodo, hoje]);

  const pedidosDoPeriodo = useMemo(() => {
    if (!pedidos) return [];
    return pedidos.filter((p) => {
      const dia = toBRDateStr(p.criado_em);
      return dia >= periodoAtual.inicio && dia <= periodoAtual.fim;
    });
  }, [pedidos, periodoAtual]);

  // Consumo agrupado por dia, mais recente primeiro
  const dias = useMemo(() => {
    const porDia: Record<string, { total: number; itens: { nome_produto: string; quantidade: number }[] }> = {};
    for (const p of pedidosDoPeriodo) {
      const dia = toBRDateStr(p.criado_em);
      if (!porDia[dia]) porDia[dia] = { total: 0, itens: [] };
      porDia[dia].total += p.total;
      porDia[dia].itens.push(...p.itens);
    }
    return Object.entries(porDia)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dia, v]) => ({ dia, ...v }));
  }, [pedidosDoPeriodo]);

  const totalPeriodo = pedidosDoPeriodo.reduce((s, p) => s + p.total, 0);
  const textoExtrato = pedidos ? montarExtrato(aluno.nome, periodoAtual.label, pedidosDoPeriodo) : "";
  const carregando = pedidos === null && !error;

  function handleCopiar() {
    navigator.clipboard.writeText(textoExtrato).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  async function handlePdf() {
    if (!pedidos) return;
    setGerandoPdf(true);
    setError(null);
    try {
      await baixarExtratoPdf({
        nomeAluno:    aluno.nome,
        turma:        aluno.turma,
        // o PDF já imprime as datas; tira o "(dd/mm a dd/mm)" do rótulo
        periodoLabel: periodoAtual.label.replace(/ \(.*\)$/, ""),
        inicio:       periodoAtual.inicio,
        fim:          periodoAtual.fim,
        pedidos:      pedidosDoPeriodo,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  const saldoCls = aluno.saldo < 0 ? "text-red-400" : aluno.saldo < 10 ? "text-amber-400" : "text-emerald-400";
  const saldoLabel = aluno.saldo < 0 ? "Em aberto" : aluno.tipo_conta === "fiado" ? "Em dia" : "Saldo disponível";

  const acaoBase =
    "flex-1 min-h-[52px] flex items-center justify-center gap-2 px-3 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-titulo"
        className="bg-cp-surface border border-cp-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho: nome + saldo */}
        <div className="p-5 border-b border-cp-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ficha-titulo" className="text-xl font-bold text-white break-words">
                {aluno.nome}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm text-gray-400">
                  {aluno.turma ? `Turma ${aluno.turma}` : "Sem turma"}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    aluno.tipo_conta === "fiado"
                      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                      : "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                  }`}
                >
                  {aluno.tipo_conta === "fiado" ? "Fiado" : "Crédito"}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 -mr-2 -mt-1 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-cp-elevated border border-cp-border px-4 py-3">
            <p className="text-sm text-gray-400">{saldoLabel}</p>
            <p className={`text-3xl font-bold tabular-nums ${saldoCls}`}>
              {fmt(aluno.saldo < 0 ? Math.abs(aluno.saldo) : aluno.saldo)}
            </p>
          </div>
        </div>

        {/* Filtros de período */}
        <div className="px-5 pt-4 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`min-h-[44px] px-3 rounded-xl text-sm font-semibold border transition-all ${
                  periodo === p.id
                    ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                    : "bg-cp-elevated border-cp-border text-gray-400 hover:border-gray-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-4 mb-2">
            <p className="text-sm text-gray-400">{periodoAtual.label}</p>
            <p className="text-base font-bold text-white tabular-nums shrink-0">{fmt(totalPeriodo)}</p>
          </div>
        </div>

        {/* Extrato */}
        <div className="px-5 pb-4 flex-1 overflow-y-auto min-h-[120px]">
          {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
          {carregando ? (
            <div className="flex items-center justify-center py-10">
              <svg className="w-6 h-6 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : dias.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nenhum consumo neste período.</p>
          ) : (
            <ul className="rounded-xl border border-cp-border divide-y divide-cp-border overflow-hidden">
              {dias.map((d) => (
                <li key={d.dia} className="px-4 py-3 bg-cp-elevated/40">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-200">{rotuloDia(d.dia)}</span>
                    <span className="text-sm font-bold text-white tabular-nums shrink-0">{fmt(d.total)}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5 break-words">{resumoItens(d.itens)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2 px-5 py-4 border-t border-cp-border shrink-0">
          <button
            onClick={handleCopiar}
            disabled={pedidos === null}
            className={`${acaoBase} bg-cp-elevated border border-cp-border text-gray-200 hover:border-gray-500`}
          >
            <span>📋</span>
            {copiado ? "Copiado!" : "Copiar"}
          </button>
          <a
            href={tel && pedidos !== null ? `https://wa.me/55${tel}?text=${encodeURIComponent(textoExtrato)}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!tel || pedidos === null}
            title={tel ? "Enviar extrato no WhatsApp" : "Cadastre o telefone no perfil do aluno"}
            className={`${acaoBase} ${
              tel && pedidos !== null
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                : "bg-gray-700 text-gray-400 cursor-not-allowed pointer-events-none"
            }`}
          >
            {WHATSAPP_ICON}
            WhatsApp
          </a>
          <button
            onClick={handlePdf}
            disabled={pedidos === null || gerandoPdf}
            className={`${acaoBase} bg-cp-elevated border border-cp-border text-gray-200 hover:border-gray-500`}
          >
            <span>📄</span>
            {gerandoPdf ? "Gerando..." : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
