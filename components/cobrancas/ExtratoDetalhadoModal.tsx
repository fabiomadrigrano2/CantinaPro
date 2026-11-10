"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarExtratoAluno, type ExtratoAluno } from "@/app/cobrancas/actions";
import { diaBR, diasNoIntervalo, hojeBR, somarDias } from "@/lib/dataBR";
import {
  ROTULO_SALDO_ATUAL, descreverSaldo, linhaDoTempo, rotuloPagamento, totaisExtrato,
} from "@/lib/extrato";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Devedor = {
  id: string;
  nome: string;
  telefone_responsavel: string | null;
};

export type Periodo = "semana_atual" | "ultimos_30" | "mes_atual" | "mes_anterior" | "personalizado";

export type Intervalo = { inicio: string; fim: string };

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

// ── helpers de data (fuso America/Sao_Paulo) ─────────────────────────────────

export const todayBR = hojeBR;
export const toBRDateStr = diaBR;

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

const addDays = somarDias;

function weekdayAbbrev(s: string): string {
  return DIAS_SEMANA[parseYMD(s).getUTCDay()];
}

function diaMes(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

function diaMesAno(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function getWeekStartStr(dateStr: string): string {
  const d = parseYMD(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toYMD(d);
}

// label: texto com as datas (tela e WhatsApp); titulo: só o nome do período
// (o PDF já imprime as datas ao lado).
export function getPeriodo(
  tipo: Periodo,
  todayStr: string,
  personalizado?: Intervalo
): { inicio: string; fim: string; label: string; titulo: string } {
  const [y, m] = todayStr.split("-").map(Number);

  if (tipo === "personalizado") {
    const { inicio, fim } = personalizado ?? { inicio: todayStr, fim: todayStr };
    return { inicio, fim, label: `${diaMesAno(inicio)} a ${diaMesAno(fim)}`, titulo: "Período escolhido" };
  }

  if (tipo === "semana_atual") {
    const inicio = getWeekStartStr(todayStr);
    const fim = addDays(inicio, 6);
    return { inicio, fim, label: `Semana atual (${diaMes(inicio)} a ${diaMes(fim)})`, titulo: "Semana atual" };
  }

  if (tipo === "ultimos_30") {
    const inicio = addDays(todayStr, -29);
    return {
      inicio, fim: todayStr,
      label: `Últimos 30 dias (${diaMes(inicio)} a ${diaMes(todayStr)})`, titulo: "Últimos 30 dias",
    };
  }

  if (tipo === "mes_atual") {
    const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
    return { inicio, fim: todayStr, label: `${MESES[m - 1]}/${y}`, titulo: `${MESES[m - 1]}/${y}` };
  }

  // mes_anterior
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const inicio = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const fim = toYMD(new Date(Date.UTC(prevYear, prevMonth, 0))); // último dia do mês anterior
  const nome = `${MESES[prevMonth - 1]}/${prevYear}`;
  return { inicio, fim, label: nome, titulo: nome };
}

export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "semana_atual", label: "Semana atual" },
  { id: "ultimos_30", label: "Últimos 30 dias" },
  { id: "mes_atual", label: "Mês atual" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "personalizado", label: "Escolher período" },
];

// Mesmo limite do servidor (buscarExtratoAluno)
const MAX_DIAS = 366;

export function validarIntervalo({ inicio, fim }: Intervalo): string | null {
  if (!inicio || !fim) return "Informe a data inicial e a final.";
  if (inicio > fim) return "A data inicial deve ser anterior ou igual à final.";
  if (diasNoIntervalo(inicio, fim) > MAX_DIAS) return `Escolha um período de até ${MAX_DIAS} dias.`;
  return null;
}

// Começa no primeiro dia do mês até hoje
export function intervaloInicial(todayStr: string): Intervalo {
  return { inicio: `${todayStr.slice(0, 8)}01`, fim: todayStr };
}

// Datas inicial e final do "Escolher período"
export function CamposPeriodo({
  valor,
  onChange,
  erro,
}: {
  valor: Intervalo;
  onChange: (v: Intervalo) => void;
  erro: string | null;
}) {
  const campo =
    "w-full min-h-[44px] bg-cp-elevated border border-cp-border rounded-lg px-3 text-sm text-gray-200 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent";
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="block text-xs text-gray-500 mb-1">De</span>
          <input
            type="date"
            value={valor.inicio}
            onChange={(e) => onChange({ ...valor, inicio: e.target.value })}
            className={campo}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-xs text-gray-500 mb-1">Até</span>
          <input
            type="date"
            value={valor.fim}
            onChange={(e) => onChange({ ...valor, fim: e.target.value })}
            className={campo}
          />
        </label>
      </div>
      {erro && <p className="text-xs text-red-400 mt-1.5">{erro}</p>}
    </div>
  );
}

// Busca o extrato (consumo + pagamentos + saldo) do período; refaz a busca
// sempre que o intervalo muda. intervalo null = período inválido, não busca.
export function useExtratoAluno(alunoId: string, intervalo: Intervalo | null) {
  const [extrato, setExtrato] = useState<ExtratoAluno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inicio = intervalo?.inicio;
  const fim = intervalo?.fim;

  useEffect(() => {
    setExtrato(null);
    setError(null);
    if (!inicio || !fim) return;
    let cancelado = false;
    (async () => {
      const result = await buscarExtratoAluno(alunoId, inicio, fim);
      if (cancelado) return;
      if (result.error) setError(result.error);
      else setExtrato(result.extrato ?? null);
    })();
    return () => {
      cancelado = true;
    };
  }, [alunoId, inicio, fim]);

  return { extrato, error, carregando: !!intervalo && extrato === null && !error };
}

// ── montagem do texto do extrato ─────────────────────────────────────────────

function resumoItens(itens: { nome: string; quantidade: number }[]): string {
  return itens
    .map((i) => (i.quantidade > 1 ? `${i.nome} x${i.quantidade}` : i.nome))
    .join(", ");
}

export function montarExtrato(
  nomeAluno: string,
  periodoLabel: string,
  extrato: ExtratoAluno
): string {
  const eventos = linhaDoTempo(extrato.pedidos, extrato.pagamentos);
  const { consumido, pago } = totaisExtrato(extrato.pedidos, extrato.pagamentos);

  const linhas = eventos.map((e) => {
    const dia = `${weekdayAbbrev(e.dia)} ${diaMes(e.dia)}`;
    return e.tipo === "consumo"
      ? `- ${dia} — ${resumoItens(e.itens)} — ${fmt(e.total)}`
      : `- ${dia} — ✅ ${rotuloPagamento(e.forma)} — ${fmt(e.valor)}`;
  });

  const corpo =
    linhas.length > 0
      ? linhas.join("\n")
      : "Nenhum consumo ou pagamento registrado neste período.";

  return (
    `📋 *Extrato de ${nomeAluno}*\n` +
    `📅 Período: ${periodoLabel}\n\n` +
    `*Detalhamento por dia:*\n` +
    `${corpo}\n\n` +
    `💰 *Total consumido: ${fmt(consumido)}*\n` +
    `✅ *Total pago no período: ${fmt(pago)}*\n` +
    `📌 *${ROTULO_SALDO_ATUAL}: ${descreverSaldo(extrato.saldoAtual)}*\n\n` +
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
  const hoje = useMemo(() => todayBR(), []);
  const [periodo, setPeriodo] = useState<Periodo>("semana_atual");
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloInicial(hoje));
  const [msg, setMsg] = useState("");
  const [editado, setEditado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const tel = devedor.telefone_responsavel ?? "";
  const temTel = !!tel.replace(/\D/g, "");

  const erroIntervalo = periodo === "personalizado" ? validarIntervalo(personalizado) : null;
  const periodoAtual = useMemo(
    () => getPeriodo(periodo, hoje, personalizado),
    [periodo, hoje, personalizado]
  );
  const { extrato, error, carregando } = useExtratoAluno(
    devedor.id,
    erroIntervalo ? null : periodoAtual
  );

  const textoGerado = useMemo(() => {
    if (!extrato) return "";
    return montarExtrato(devedor.nome, periodoAtual.label, extrato);
  }, [extrato, periodoAtual.label, devedor.nome]);

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
  const pronto = extrato !== null;

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

          {periodo === "personalizado" && (
            <div className="shrink-0">
              <CamposPeriodo valor={personalizado} onChange={setPersonalizado} erro={erroIntervalo} />
            </div>
          )}

          {error && <p className="text-xs text-red-400 shrink-0">{error}</p>}

          {carregando ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : pronto ? (
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
          ) : null}
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
              disabled={!pronto}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-cp-elevated border border-cp-border hover:border-gray-500 text-gray-200 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copiado ? "Copiado!" : "Copiar extrato"}
            </button>
            <a
              href={pronto ? waUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => temTel && onClose()}
              aria-disabled={!temTel || !pronto}
              title={temTel ? "Enviar no WhatsApp" : "Cadastre o telefone no perfil do aluno"}
              className={`min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow ${
                temTel && pronto
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
