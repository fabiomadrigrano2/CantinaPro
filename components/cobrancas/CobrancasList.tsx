"use client";

import { useState, useMemo, useTransition } from "react";
import type { CicloSemana } from "@/types/cobrancas";
import { marcarCiclosComoPagos } from "@/app/cobrancas/actions";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Devedor = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  ciclo_cobranca: string | null;
  dia_cobranca: number | null;
  telefone_responsavel: string | null;
};

type AlunoSemCredito = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  telefone_responsavel: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function dataBR(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function getWeekStartClient(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStrClient(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildMessageSemanal(devedor: Devedor, ciclos: CicloSemana[]): string {
  const primeiroNome = devedor.nome.split(" ")[0];
  const totalAberto = fmt(Math.abs(devedor.saldo));
  const semanaAtualStr = toDateStrClient(getWeekStartClient(new Date()));

  const linhas = ciclos.map((c) => {
    const inicio = dataBR(c.semana_inicio);
    const fim = dataBR(c.semana_fim);
    const isCurrent = c.semana_inicio === semanaAtualStr;
    return isCurrent
      ? `• Semana ${inicio} a ${fim}: *${fmt(c.total)}* (semana atual)`
      : `• Semana ${inicio} a ${fim}: *${fmt(c.total)}* ⚠️ Pendente`;
  });

  const extratoSemanal =
    linhas.length > 0
      ? `\n\n📅 *Extrato por semana:*\n${linhas.join("\n")}`
      : "";

  return (
    `Oi! Tudo bem? 😊\n\n` +
    `Passando pra avisar que *${primeiroNome}* está com *${totalAberto}* em aberto na cantina.` +
    extratoSemanal +
    `\n\n💰 *Total em aberto: ${totalAberto}*\n\n` +
    `Qualquer dúvida é só chamar! 🙏`
  );
}

function buildCreditoMessage(aluno: AlunoSemCredito): string {
  const primeiroNome = aluno.nome.split(" ")[0];
  return (
    `Oi! O saldo de crédito do(a) ${primeiroNome} zerou na cantina. ` +
    `Para continuar comprando, é necessário fazer uma recarga. ` +
    `Qualquer dúvida estou à disposição!`
  );
}

function buildWhatsAppUrl(tel: string, message: string): string {
  const telClean = tel.replace(/\D/g, "");
  const base = telClean ? `https://wa.me/55${telClean}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

// ── ícones ────────────────────────────────────────────────────────────────────

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.122 1.524 5.855L.057 23.57a.75.75 0 0 0 .921.921l5.716-1.467A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.713 9.713 0 0 1-4.953-1.357l-.355-.212-3.684.945.963-3.617-.231-.373A9.718 9.718 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
  </svg>
);

// ── modal de prévia da mensagem ───────────────────────────────────────────────

function ExtratoModal({
  devedor,
  initialMessage,
  onClose,
}: {
  devedor: { nome: string; turma: string | null; saldo: number; telefone_responsavel: string | null };
  initialMessage: string;
  onClose: () => void;
}) {
  const [msg, setMsg] = useState(initialMessage);
  const tel   = devedor.telefone_responsavel ?? "";
  const waUrl = buildWhatsAppUrl(tel, msg);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-cp-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white leading-tight">{devedor.nome}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500">Turma {devedor.turma ?? "—"}</span>
              {devedor.saldo < 0 ? (
                <span className="text-sm font-bold text-red-400 tabular-nums">
                  {fmt(Math.abs(devedor.saldo))} em aberto
                </span>
              ) : (
                <span className="text-sm font-bold text-amber-400">Saldo zerado</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors ml-4 mt-0.5 shrink-0"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-2 flex-1 overflow-hidden">
          <p className="text-xs text-gray-500 shrink-0">Edite a mensagem antes de enviar:</p>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            className="flex-1 min-h-[220px] w-full bg-cp-elevated border border-cp-border rounded-xl p-4 text-sm text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-cp-border shrink-0">
          <button
            onClick={() => setMsg(initialMessage)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Restaurar original
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
            >
              Cancelar
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-all shadow shadow-emerald-500/20"
            >
              {WHATSAPP_ICON}
              Enviar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── modal de confirmação de pagamento ────────────────────────────────────────

function ConfirmacaoPagamentoModal({
  devedor,
  ciclos,
  cicloInicialSemana,
  onClose,
}: {
  devedor: Devedor;
  ciclos: CicloSemana[];
  cicloInicialSemana: string;
  onClose: () => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set([cicloInicialSemana])
  );
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const semanaAtualStr = toDateStrClient(getWeekStartClient(new Date()));
  const saldoDevedor = Math.abs(devedor.saldo);
  const totalSelecionado = ciclos
    .filter((c) => selecionados.has(c.semana_inicio))
    .reduce((s, c) => s + c.total, 0);
  const totalEfetivo = Math.min(totalSelecionado, saldoDevedor);
  const excedeSaldo = totalSelecionado > saldoDevedor + 0.005;

  function toggleCiclo(semanaInicio: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(semanaInicio)) next.delete(semanaInicio);
      else next.add(semanaInicio);
      return next;
    });
  }

  function handleConfirmar() {
    const ciclosSelecionados = ciclos
      .filter((c) => selecionados.has(c.semana_inicio))
      .map((c) => ({
        semanaInicio: c.semana_inicio,
        semanaFim: c.semana_fim,
        total: c.total,
        cicloId: c.ciclo_id,
      }));

    startTransition(async () => {
      const result = await marcarCiclosComoPagos({
        alunoId: devedor.id,
        ciclos: ciclosSelecionados,
        formaPagamento,
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const formasPagamento = [
    { id: "dinheiro", label: "Dinheiro" },
    { id: "pix",      label: "Pix"      },
    { id: "cartao",   label: "Cartão"   },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between p-5 border-b border-cp-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Registrar Pagamento</h2>
            <p className="text-sm text-gray-400 mt-0.5">{devedor.nome}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors ml-4 mt-0.5 shrink-0"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 flex flex-col gap-3 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 shrink-0">Selecione as semanas pagas:</p>

          {ciclos.map((ciclo) => {
            const checked = selecionados.has(ciclo.semana_inicio);
            const isCurrent = ciclo.semana_inicio === semanaAtualStr;
            return (
              <label
                key={ciclo.semana_inicio}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  checked
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-cp-elevated border-cp-border hover:border-gray-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCiclo(ciclo.semana_inicio)}
                  className="w-4 h-4 accent-emerald-500 shrink-0"
                />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                      isCurrent
                        ? "bg-blue-400/10 text-blue-300 border-blue-400/20"
                        : "bg-amber-400/10 text-amber-300 border-amber-400/20"
                    }`}
                  >
                    {isCurrent ? "Atual" : "Pendente"}
                  </span>
                  <span className="text-sm text-gray-300 whitespace-nowrap">
                    {dataBR(ciclo.semana_inicio)} → {dataBR(ciclo.semana_fim)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-white tabular-nums shrink-0">
                  {fmt(ciclo.total)}
                </span>
              </label>
            );
          })}

          {/* Forma de pagamento */}
          <div className="mt-1">
            <p className="text-xs text-gray-500 mb-2">Forma de pagamento:</p>
            <div className="flex gap-2">
              {formasPagamento.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormaPagamento(f.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    formaPagamento === f.id
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                      : "bg-cp-elevated border-cp-border text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-cp-border shrink-0">
          <div>
            <p className="text-xs text-gray-500">Total a pagar</p>
            <p className="text-base font-bold text-white tabular-nums">{fmt(totalEfetivo)}</p>
            {excedeSaldo && (
              <p className="text-xs text-amber-400 mt-0.5">
                Limitado ao saldo devedor ({fmt(saldoDevedor)})
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={isPending || selecionados.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-all shadow shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── cartão de aluno com ciclos semanais ───────────────────────────────────────

function DevedorCard({
  devedor,
  ciclos,
  onPreview,
}: {
  devedor: Devedor;
  ciclos: CicloSemana[];
  onPreview: () => void;
}) {
  const [pagamentoModal, setPagamentoModal] = useState<string | null>(null);

  const temTel = !!(devedor.telefone_responsavel?.replace(/\D/g, ""));
  const semanaAtualStr = toDateStrClient(getWeekStartClient(new Date()));
  const totalCiclos = ciclos.reduce((s, c) => s + c.total, 0);

  return (
    <>
      {pagamentoModal !== null && (
        <ConfirmacaoPagamentoModal
          devedor={devedor}
          ciclos={ciclos}
          cicloInicialSemana={pagamentoModal}
          onClose={() => setPagamentoModal(null)}
        />
      )}

      <div className="rounded-2xl border border-cp-border bg-cp-surface overflow-hidden">
        {/* Cabeçalho do aluno */}
        <div className="flex items-center justify-between px-5 py-4 bg-cp-elevated border-b border-cp-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{devedor.nome}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {devedor.turma ? `Turma ${devedor.turma}` : "Sem turma"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <span className="text-sm font-bold text-red-400 tabular-nums">
              {fmt(Math.abs(devedor.saldo))}
            </span>
            <button
              onClick={temTel ? onPreview : undefined}
              disabled={!temTel}
              title={temTel ? "Ver prévia e enviar via WhatsApp" : "Cadastre o telefone no perfil do aluno"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                temTel
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {WHATSAPP_ICON}
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Semanas pendentes */}
        {ciclos.length > 0 ? (
          <div className="divide-y divide-cp-border">
            {ciclos.map((ciclo) => {
              const isCurrent = ciclo.semana_inicio === semanaAtualStr;

              return (
                <div
                  key={ciclo.semana_inicio}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                        isCurrent
                          ? "bg-blue-400/10 text-blue-300 border-blue-400/20"
                          : "bg-amber-400/10 text-amber-300 border-amber-400/20"
                      }`}
                    >
                      {isCurrent ? "Atual" : "Pendente"}
                    </span>
                    <span className="text-sm text-gray-300 tabular-nums whitespace-nowrap">
                      {dataBR(ciclo.semana_inicio)} → {dataBR(ciclo.semana_fim)}
                    </span>
                    <span className="text-sm font-semibold text-white tabular-nums">
                      {fmt(ciclo.total)}
                    </span>
                  </div>

                  <button
                    onClick={() => setPagamentoModal(ciclo.semana_inicio)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cobrado
                  </button>
                </div>
              );
            })}

            {/* Total dos ciclos */}
            {ciclos.length > 1 && (
              <div className="flex items-center justify-end gap-2 px-5 py-2 bg-cp-elevated/50">
                <span className="text-xs text-gray-500">Total dos ciclos:</span>
                <span className="text-sm font-bold text-red-400 tabular-nums">
                  {fmt(totalCiclos)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500">
              Nenhum pedido nos últimos 90 dias — saldo em aberto de períodos anteriores.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

export default function CobrancasList({
  initialDevedores,
  ciclosSemanaisPorAluno,
  semCredito,
}: {
  initialDevedores: Devedor[];
  ciclosSemanaisPorAluno: Record<string, CicloSemana[]>;
  semCredito: AlunoSemCredito[];
}) {
  const [search,      setSearch]      = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [preview, setPreview] = useState<{
    devedor: Devedor;
    initialMessage: string;
  } | null>(null);

  const turmas = useMemo(() => {
    const set = new Set<string>();
    initialDevedores.forEach((d) => { if (d.turma) set.add(d.turma); });
    semCredito.forEach((a) => { if (a.turma) set.add(a.turma); });
    return Array.from(set).sort();
  }, [initialDevedores, semCredito]);

  const filtered = useMemo(() => {
    return initialDevedores.filter((d) => {
      const nome  = d.nome.toLowerCase();
      const turma = d.turma ?? "";
      return (
        nome.includes(search.toLowerCase()) &&
        (turmaFiltro === "todas" || turma === turmaFiltro)
      );
    });
  }, [initialDevedores, search, turmaFiltro]);

  const filteredSemCredito = useMemo(() => {
    return semCredito.filter((a) => {
      const nome  = a.nome.toLowerCase();
      const turma = a.turma ?? "";
      return (
        nome.includes(search.toLowerCase()) &&
        (turmaFiltro === "todas" || turma === turmaFiltro)
      );
    });
  }, [semCredito, search, turmaFiltro]);

  const totalDevedor = useMemo(
    () => filtered.reduce((s, d) => s + (d.saldo ?? 0), 0),
    [filtered]
  );

  return (
    <>
      {preview && (
        <ExtratoModal
          devedor={preview.devedor}
          initialMessage={preview.initialMessage}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
          {turmas.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Totalizador */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 mb-4 rounded-xl bg-red-500/5 border border-red-500/15">
          <span className="text-sm text-gray-400">
            {filtered.length} aluno{filtered.length !== 1 ? "s" : ""} com débito
            {(turmaFiltro !== "todas" || search) ? " (filtrado)" : ""}
          </span>
          <span className="text-sm font-bold text-red-400 tabular-nums">
            {fmt(Math.abs(totalDevedor))} em aberto
          </span>
        </div>
      )}

      {/* Lista de devedores — cartões */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">
            {search || turmaFiltro !== "todas" ? "🔍" : "✅"}
          </span>
          <p className="text-gray-400 font-medium">
            {search || turmaFiltro !== "todas"
              ? "Nenhum aluno encontrado para este filtro."
              : "Nenhum aluno com saldo devedor. Tudo em dia!"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((devedor) => {
            const ciclos = ciclosSemanaisPorAluno[devedor.id] ?? [];
            return (
              <DevedorCard
                key={devedor.id}
                devedor={devedor}
                ciclos={ciclos}
                onPreview={() =>
                  setPreview({
                    devedor,
                    initialMessage: buildMessageSemanal(devedor, ciclos),
                  })
                }
              />
            );
          })}
        </div>
      )}

      {/* ── Seção: Crédito Zerado ─────────────────────────────────────── */}
      {filteredSemCredito.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-base font-semibold text-white">Crédito Zerado</h2>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">
              {filteredSemCredito.length} aluno{filteredSemCredito.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Alunos com conta Crédito com saldo zerado ou negativo. Avise o responsável para fazer recarga.
          </p>

          <div className="rounded-2xl border border-amber-500/15 overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_100px_130px_110px] gap-4 px-5 py-3 bg-cp-elevated border-b border-cp-border text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Aluno</span>
              <span>Turma</span>
              <span>Saldo</span>
              <span>Ação</span>
            </div>

            <div className="divide-y divide-cp-border">
              {filteredSemCredito.map((a, i) => {
                const temTel = !!(a.telefone_responsavel?.replace(/\D/g, ""));
                const waBtnCls = temTel
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed";
                const waTitle = temTel
                  ? "Ver prévia e enviar via WhatsApp"
                  : "Cadastre o telefone no perfil do aluno";
                const openPreview = () => {
                  if (temTel)
                    setPreview({
                      devedor: { ...a, ciclo_cobranca: null, dia_cobranca: null },
                      initialMessage: buildCreditoMessage(a),
                    });
                };

                return (
                  <div
                    key={a.id ?? i}
                    className="grid grid-cols-1 md:grid-cols-[1fr_100px_130px_110px] gap-2 md:gap-4 px-5 py-4 bg-cp-surface hover:bg-cp-elevated transition-colors items-center"
                  >
                    <div className="flex items-center justify-between md:justify-start gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.nome}</p>
                        <p className="text-xs text-gray-500 mt-0.5 md:hidden">{a.turma ?? "—"}</p>
                      </div>
                      <button
                        onClick={openPreview}
                        disabled={!temTel}
                        title={waTitle}
                        className={`md:hidden shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${waBtnCls}`}
                      >
                        {WHATSAPP_ICON}
                        WhatsApp
                      </button>
                    </div>

                    <span className="hidden md:block text-sm text-gray-400 truncate">
                      {a.turma ?? "—"}
                    </span>

                    <span className={`text-sm font-bold tabular-nums ${a.saldo < 0 ? "text-red-400" : "text-amber-400"}`}>
                      {a.saldo < 0 ? fmt(a.saldo) : "R$ 0,00"}
                    </span>

                    <button
                      onClick={openPreview}
                      disabled={!temTel}
                      title={waTitle}
                      className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all w-fit ${waBtnCls}`}
                    >
                      {WHATSAPP_ICON}
                      WhatsApp
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Aviso coluna telefone */}
      {(filtered.some((d) => !d.telefone_responsavel) ||
        filteredSemCredito.some((a) => !a.telefone_responsavel)) && (
        <p className="mt-4 text-xs text-gray-600">
          Alunos sem telefone cadastrado aparecem com o botão WhatsApp desabilitado. Edite o aluno em{" "}
          <a href="/alunos" className="text-orange-400 hover:underline">Alunos</a> para adicionar.
        </p>
      )}
    </>
  );
}
