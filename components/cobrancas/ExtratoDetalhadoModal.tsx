"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarExtratoAluno, type PedidoExtrato } from "@/app/cobrancas/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Devedor = {
  id: string;
  nome: string;
  telefone_responsavel: string | null;
};

export type Periodo = "semana_atual" | "ultimos_30" | "mes_atual" | "mes_anterior";

// ── helpers de formatação ────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function buildWhatsAppUrl(tel: string, message: string): string {
  const telClean = tel.replace(/\D/g, "");
  const base = telClean ? `https://wa.me/55${telClean}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

// ── helpers de data (BR = UTC-3 fixo, sem horário de verão desde 2019) ───────

export function todayBR(): string {
  const brTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = brTime.getUTCFullYear();
  const m = String(brTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brTime.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toBRDateStr(iso: string): string {
  const brTime = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  const y = brTime.getUTCFullYear();
  const m = String(brTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brTime.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
}

function weekdayAbbrev(s: string): string {
  return DIAS_SEMANA[parseYMD(s).getUTCDay()];
}

function diaMes(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

function getWeekStartStr(dateStr: string): string {
  const d = parseYMD(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toYMD(d);
}

export function getPeriodo(tipo: Periodo, todayStr: string): { inicio: string; fim: string; label: string } {
  const [y, m] = todayStr.split("-").map(Number);

  if (tipo === "semana_atual") {
    const inicio = getWeekStartStr(todayStr);
    const fim = addDays(inicio, 6);
    return { inicio, fim, label: `Semana atual (${diaMes(inicio)} a ${diaMes(fim)})` };
  }

  if (tipo === "ultimos_30") {
    const inicio = addDays(todayStr, -29);
    return { inicio, fim: todayStr, label: `Últimos 30 dias (${diaMes(inicio)} a ${diaMes(todayStr)})` };
  }

  if (tipo === "mes_atual") {
    const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
    return { inicio, fim: todayStr, label: `${MESES[m - 1]}/${y}` };
  }

  // mes_anterior
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const inicio = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const fim = toYMD(new Date(Date.UTC(prevYear, prevMonth, 0))); // último dia do mês anterior
  return { inicio, fim, label: `${MESES[prevMonth - 1]}/${prevYear}` };
}

export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "semana_atual", label: "Semana atual" },
  { id: "ultimos_30", label: "Últimos 30 dias" },
  { id: "mes_atual", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
];

// ── montagem do texto do extrato ─────────────────────────────────────────────

function resumoItens(itens: { nome_produto: string; quantidade: number }[]): string {
  return itens
    .map((i) => (i.quantidade > 1 ? `${i.nome_produto} x${i.quantidade}` : i.nome_produto))
    .join(", ");
}

export function montarExtrato(
  nomeAluno: string,
  periodoLabel: string,
  pedidos: PedidoExtrato[]
): string {
  const porDia: Record<string, { total: number; itens: { nome_produto: string; quantidade: number }[] }> = {};

  for (const p of pedidos) {
    const dia = toBRDateStr(p.criado_em);
    if (!porDia[dia]) porDia[dia] = { total: 0, itens: [] };
    porDia[dia].total += p.total;
    porDia[dia].itens.push(...p.itens);
  }

  const dias = Object.keys(porDia).sort();
  const total = pedidos.reduce((s, p) => s + p.total, 0);

  const linhas = dias.map((dia) => {
    const { total: totalDia, itens } = porDia[dia];
    return `- ${weekdayAbbrev(dia)} ${diaMes(dia)} — ${resumoItens(itens)} — ${fmt(totalDia)}`;
  });

  const corpo =
    linhas.length > 0
      ? linhas.join("\n")
      : "Nenhum consumo registrado neste período.";

  return (
    `📋 *Extrato de ${nomeAluno}*\n` +
    `📅 Período: ${periodoLabel}\n\n` +
    `*Detalhamento por dia:*\n` +
    `${corpo}\n\n` +
    `💰 *Total do período: ${fmt(total)}*\n\n` +
    `Qualquer dúvida é só chamar! 🙏`
  );
}

// ── componente ────────────────────────────────────────────────────────────────

export default function ExtratoDetalhadoModal({
  devedor,
  onClose,
}: {
  devedor: Devedor;
  onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("semana_atual");
  const [pedidos, setPedidos] = useState<PedidoExtrato[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [editado, setEditado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const hoje = useMemo(() => todayBR(), []);
  const tel = devedor.telefone_responsavel ?? "";
  const temTel = !!tel.replace(/\D/g, "");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const result = await buscarExtratoAluno(devedor.id);
      if (cancelado) return;
      if (result.error) setError(result.error);
      else setPedidos(result.pedidos ?? []);
    })();
    return () => {
      cancelado = true;
    };
  }, [devedor.id]);

  const periodoAtual = useMemo(() => getPeriodo(periodo, hoje), [periodo, hoje]);

  const pedidosDoPeriodo = useMemo(() => {
    if (!pedidos) return [];
    return pedidos.filter((p) => {
      const dia = toBRDateStr(p.criado_em);
      return dia >= periodoAtual.inicio && dia <= periodoAtual.fim;
    });
  }, [pedidos, periodoAtual]);

  const textoGerado = useMemo(() => {
    if (!pedidos) return "";
    return montarExtrato(devedor.nome, periodoAtual.label, pedidosDoPeriodo);
  }, [pedidos, pedidosDoPeriodo, periodoAtual, devedor.nome]);

  useEffect(() => {
    setMsg(textoGerado);
    setEditado(false);
  }, [textoGerado]);

  function handleCopiar() {
    navigator.clipboard.writeText(msg).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const waUrl = buildWhatsAppUrl(tel, msg);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-cp-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white leading-tight break-words">
              📋 Extrato de {devedor.nome}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="-mr-3 -mt-2.5 ml-2 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-white transition-colors shrink-0"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3 flex-1 overflow-hidden">
          <div className="flex flex-wrap gap-2 shrink-0">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  periodo === p.id
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : "bg-cp-elevated border-cp-border text-gray-400 hover:border-gray-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-400 shrink-0">{error}</p>}

          {pedidos === null && !error ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 shrink-0">Edite o extrato antes de copiar ou enviar:</p>
              <textarea
                value={msg}
                onChange={(e) => {
                  setMsg(e.target.value);
                  setEditado(true);
                }}
                className="flex-1 min-h-[160px] sm:min-h-[220px] w-full bg-cp-elevated border border-cp-border rounded-xl p-4 text-sm text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition leading-relaxed"
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 border-t border-cp-border shrink-0">
          <button
            onClick={() => {
              setMsg(textoGerado);
              setEditado(false);
            }}
            disabled={!editado}
            className="min-h-[44px] text-sm text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-0"
          >
            Restaurar original
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 ml-auto">
            <button
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
            >
              Fechar
            </button>
            <button
              onClick={handleCopiar}
              disabled={pedidos === null}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-cp-elevated border border-cp-border hover:border-gray-500 text-gray-200 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copiado ? "Copiado!" : "Copiar extrato"}
            </button>
            <a
              href={pedidos === null ? undefined : waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => temTel && onClose()}
              aria-disabled={!temTel || pedidos === null}
              title={temTel ? "Enviar no WhatsApp" : "Cadastre o telefone no perfil do aluno"}
              className={`min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow ${
                temTel && pedidos !== null
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 cursor-pointer"
                  : "bg-gray-700 text-gray-400 shadow-none cursor-not-allowed pointer-events-none"
              }`}
            >
              Enviar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
