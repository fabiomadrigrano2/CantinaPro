"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CamposPeriodo, PERIODOS, getPeriodo, intervaloInicial, montarExtrato, todayBR,
  useExtratoAluno, validarIntervalo, type Intervalo, type Periodo,
} from "@/components/cobrancas/ExtratoDetalhadoModal";
import { WHATSAPP_ICON } from "@/components/cobrancas/CobrancasList";
import { baixarExtratoPdf } from "@/lib/extratoPdf";
import { linhaDoTempo, rotuloPagamento, totaisExtrato } from "@/lib/extrato";

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

function resumoItens(itens: { nome: string; quantidade: number }[]): string {
  return itens
    .map((i) => (i.quantidade > 1 ? `${i.nome} x${i.quantidade}` : i.nome))
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
  const hoje = useMemo(() => todayBR(), []);
  const [periodo, setPeriodo] = useState<Periodo>("semana_atual");
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloInicial(hoje));
  const [copiado, setCopiado] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  const tel = aluno.telefone_responsavel?.replace(/\D/g, "") ?? "";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const erroIntervalo = periodo === "personalizado" ? validarIntervalo(personalizado) : null;
  const periodoAtual = useMemo(
    () => getPeriodo(periodo, hoje, personalizado),
    [periodo, hoje, personalizado]
  );
  const { extrato, error: erroExtrato, carregando } = useExtratoAluno(
    aluno.id,
    erroIntervalo ? null : periodoAtual
  );
  const error = erroExtrato ?? erroPdf;

  // Consumo por dia e pagamentos, mais recente primeiro
  const eventos = useMemo(
    () => (extrato ? linhaDoTempo(extrato.pedidos, extrato.pagamentos).reverse() : []),
    [extrato]
  );
  const totais = extrato ? totaisExtrato(extrato.pedidos, extrato.pagamentos) : { consumido: 0, pago: 0 };
  const textoExtrato = extrato ? montarExtrato(aluno.nome, periodoAtual.label, extrato) : "";

  function handleCopiar() {
    navigator.clipboard.writeText(textoExtrato).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  async function handlePdf() {
    if (!extrato) return;
    setGerandoPdf(true);
    setErroPdf(null);
    try {
      await baixarExtratoPdf({
        cantina:      extrato.cantina,
        nomeAluno:    aluno.nome,
        turma:        aluno.turma,
        periodoLabel: periodoAtual.titulo,
        inicio:       periodoAtual.inicio,
        fim:          periodoAtual.fim,
        extrato,
      });
    } catch (e) {
      setErroPdf(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
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
        className="bg-cp-surface border border-cp-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92dvh]"
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
                  p.id === "personalizado" ? "col-span-2" : ""
                } ${
                  periodo === p.id
                    ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                    : "bg-cp-elevated border-cp-border text-gray-400 hover:border-gray-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {periodo === "personalizado" && (
            <div className="mt-3">
              <CamposPeriodo valor={personalizado} onChange={setPersonalizado} erro={erroIntervalo} />
            </div>
          )}
          <div className="mt-4 mb-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-gray-400">{periodoAtual.label}</p>
              <p className="text-base font-bold text-white tabular-nums shrink-0">{fmt(totais.consumido)}</p>
            </div>
            {totais.pago > 0 && (
              <p className="text-sm text-emerald-400 text-right tabular-nums">Pago no período: {fmt(totais.pago)}</p>
            )}
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
          ) : !extrato ? null : eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nenhum consumo ou pagamento neste período.</p>
          ) : (
            <ul className="rounded-xl border border-cp-border divide-y divide-cp-border overflow-hidden">
              {eventos.map((e) =>
                e.tipo === "consumo" ? (
                  <li key={`c-${e.dia}`} className="px-4 py-3 bg-cp-elevated/40">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-200">{rotuloDia(e.dia)}</span>
                      <span className="text-sm font-bold text-white tabular-nums shrink-0">{fmt(e.total)}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5 break-words">{resumoItens(e.itens)}</p>
                  </li>
                ) : (
                  <li key={`p-${e.quando}-${e.valor}`} className="px-4 py-3 bg-emerald-500/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-emerald-400">
                        {rotuloDia(e.dia)} · {rotuloPagamento(e.forma)}
                      </span>
                      <span className="text-sm font-bold text-emerald-400 tabular-nums shrink-0">{fmt(e.valor)}</span>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2 px-5 py-4 border-t border-cp-border shrink-0">
          <button
            onClick={handleCopiar}
            disabled={!extrato}
            className={`${acaoBase} bg-cp-elevated border border-cp-border text-gray-200 hover:border-gray-500`}
          >
            <span>📋</span>
            {copiado ? "Copiado!" : "Copiar"}
          </button>
          <a
            href={tel && extrato ? `https://wa.me/55${tel}?text=${encodeURIComponent(textoExtrato)}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!tel || !extrato}
            title={tel ? "Enviar extrato no WhatsApp" : "Cadastre o telefone no perfil do aluno"}
            className={`${acaoBase} ${
              tel && extrato
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                : "bg-gray-700 text-gray-400 cursor-not-allowed pointer-events-none"
            }`}
          >
            {WHATSAPP_ICON}
            WhatsApp
          </a>
          <button
            onClick={handlePdf}
            disabled={!extrato || gerandoPdf}
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
