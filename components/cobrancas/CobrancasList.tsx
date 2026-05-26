"use client";

import { useState, useMemo } from "react";

// ── tipos ─────────────────────────────────────────────────────────────────────

type PedidoItem = {
  nome_produto: string;
  quantidade: number;
};

type PedidoExtrato = {
  id: string;
  aluno_id: string;
  total: number;
  criado_em: string;
  itens_pedido: PedidoItem[];
};

type Devedor = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  ciclo_cobranca: string | null;
  dia_cobranca: number | null;
  telefone_responsavel: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function proximoCiclo(ciclo: string | null, dia: number | null): string {
  const hoje = new Date();
  if (ciclo === "semanal") {
    const diasAteSexta = (5 - hoje.getDay() + 7) % 7 || 7;
    const sexta = new Date(hoje);
    sexta.setDate(hoje.getDate() + diasAteSexta);
    return sexta.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const diaAlvo = dia ?? 5;
  const candidato = new Date(hoje.getFullYear(), hoje.getMonth(), diaAlvo);
  if (candidato <= hoje) candidato.setMonth(candidato.getMonth() + 1);
  return candidato.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildWhatsAppUrl(devedor: Devedor, pedidos: PedidoExtrato[]): string {
  const nome  = devedor.nome;
  const turma = devedor.turma ?? "—";
  const valor = fmt(Math.abs(devedor.saldo));
  const tel   = (devedor.telefone_responsavel ?? "").replace(/\D/g, "");
  const venc  = proximoCiclo(devedor.ciclo_cobranca, devedor.dia_cobranca);

  const extratoLines = pedidos.slice(0, 10).map((p) => {
    const data  = new Date(p.criado_em).toLocaleDateString("pt-BR");
    const itens = p.itens_pedido
      .map((i) => `${i.quantidade > 1 ? i.quantidade + "x " : ""}${i.nome_produto}`)
      .join(", ");
    return `- ${data}: ${itens} - ${fmt(p.total)}`;
  });

  const extrato =
    extratoLines.length > 0
      ? `\n\nExtrato recente (últimos 30 dias):\n${extratoLines.join("\n")}`
      : "";

  const msg =
    `Olá! Passando para informar que o(a) aluno(a) ${nome}, da turma ${turma}, possui um saldo devedor de ${valor} na cantina.` +
    extrato +
    `\n\nTotal em aberto: ${valor}` +
    `\nPróximo vencimento: ${venc}` +
    `\n\nPor favor, entre em contato para regularizar. Obrigado!`;

  const base = tel ? `https://wa.me/55${tel}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(msg)}`;
}

function cicloBadge(ciclo: string | null) {
  if (ciclo === "semanal")
    return { label: "📅 Semanal", cls: "bg-violet-400/10 text-violet-300 border-violet-400/20" };
  return { label: "🗓️ Mensal", cls: "bg-sky-400/10 text-sky-300 border-sky-400/20" };
}

// ── ícones ────────────────────────────────────────────────────────────────────

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.122 1.524 5.855L.057 23.57a.75.75 0 0 0 .921.921l5.716-1.467A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.713 9.713 0 0 1-4.953-1.357l-.355-.212-3.684.945.963-3.617-.231-.373A9.718 9.718 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
  </svg>
);

// ── modal de prévia do extrato ────────────────────────────────────────────────

function ExtratoModal({
  devedor,
  pedidos,
  onClose,
}: {
  devedor: Devedor;
  pedidos: PedidoExtrato[];
  onClose: () => void;
}) {
  const venc  = proximoCiclo(devedor.ciclo_cobranca, devedor.dia_cobranca);
  const total = Math.abs(devedor.saldo);
  const waUrl = buildWhatsAppUrl(devedor, pedidos);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-cp-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white leading-tight">{devedor.nome}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Turma {devedor.turma ?? "—"}</p>
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

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Saldo */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <span className="text-sm text-gray-400">Saldo devedor</span>
            <span className="text-xl font-bold text-red-400 tabular-nums">{fmt(total)}</span>
          </div>

          {/* Histórico */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Compras — últimos 30 dias
            </p>
            {pedidos.length > 0 ? (
              <div className="space-y-2">
                {pedidos.map((p) => {
                  const data  = new Date(p.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  const itens = p.itens_pedido
                    .map((i) => `${i.quantidade > 1 ? i.quantidade + "x " : ""}${i.nome_produto}`)
                    .join(", ");
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-gray-600 tabular-nums shrink-0 text-xs">{data}</span>
                        <span className="text-gray-300 truncate">{itens}</span>
                      </div>
                      <span className="text-gray-400 tabular-nums shrink-0 text-xs">{fmt(p.total)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">Nenhuma compra nos últimos 30 dias.</p>
            )}
          </div>

          {/* Totais e vencimento */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cp-border">
            <div>
              <p className="text-xs text-gray-600 mb-0.5">Total em aberto</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(total)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-0.5">Próximo vencimento</p>
              <p className="text-sm font-semibold text-white">{venc}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-cp-border shrink-0">
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
  );
}

// ── componente principal ──────────────────────────────────────────────────────

export default function CobrancasList({
  initialDevedores,
  pedidosPorAluno,
}: {
  initialDevedores: Devedor[];
  pedidosPorAluno: Record<string, PedidoExtrato[]>;
}) {
  const [search,      setSearch]      = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [preview,     setPreview]     = useState<{ devedor: Devedor; pedidos: PedidoExtrato[] } | null>(null);

  const turmas = useMemo(() => {
    const set = new Set<string>();
    initialDevedores.forEach((d) => { if (d.turma) set.add(d.turma); });
    return Array.from(set).sort();
  }, [initialDevedores]);

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

  const totalDevedor = useMemo(
    () => filtered.reduce((s, d) => s + (d.saldo ?? 0), 0),
    [filtered]
  );

  return (
    <>
      {/* Modal */}
      {preview && (
        <ExtratoModal
          devedor={preview.devedor}
          pedidos={preview.pedidos}
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

      {/* Conteúdo */}
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
        <div className="rounded-2xl border border-cp-border overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_130px_110px_130px_110px] gap-4 px-5 py-3 bg-cp-elevated border-b border-cp-border text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Aluno</span>
            <span>Turma</span>
            <span>Saldo devedor</span>
            <span>Ciclo</span>
            <span>Próximo venc.</span>
            <span>Ação</span>
          </div>

          <div className="divide-y divide-cp-border">
            {filtered.map((d, i) => {
              const pedidos = pedidosPorAluno[d.id] ?? [];
              const badge   = cicloBadge(d.ciclo_cobranca);
              const venc    = proximoCiclo(d.ciclo_cobranca, d.dia_cobranca);
              const temTel  = !!(d.telefone_responsavel?.replace(/\D/g, ""));

              const waBtnCls = temTel
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                : "bg-gray-700 text-gray-400 cursor-not-allowed";
              const waTitle  = temTel
                ? "Ver extrato e enviar via WhatsApp"
                : "Cadastre o telefone no perfil do aluno";

              const openPreview = () => {
                if (temTel) setPreview({ devedor: d, pedidos });
              };

              return (
                <div
                  key={d.id ?? i}
                  className="grid grid-cols-1 md:grid-cols-[1fr_100px_130px_110px_130px_110px] gap-2 md:gap-4 px-5 py-4 bg-cp-surface hover:bg-cp-elevated transition-colors items-center"
                >
                  {/* Aluno */}
                  <div className="flex items-center justify-between md:justify-start gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5 md:hidden">{d.turma ?? "—"}</p>
                    </div>
                    {/* WhatsApp — mobile */}
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

                  {/* Turma (desktop) */}
                  <span className="hidden md:block text-sm text-gray-400 truncate">
                    {d.turma ?? "—"}
                  </span>

                  {/* Saldo devedor */}
                  <span className="text-sm font-bold text-red-400 tabular-nums">
                    {fmt(Math.abs(d.saldo ?? 0))}
                  </span>

                  {/* Ciclo */}
                  <span className={`hidden md:inline-flex self-center text-xs px-2 py-0.5 rounded-full border w-fit ${badge.cls}`}>
                    {badge.label}
                  </span>

                  {/* Próximo vencimento */}
                  <span className="hidden md:block text-sm text-gray-400 tabular-nums">
                    {venc}
                  </span>

                  {/* WhatsApp — desktop */}
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
      )}

      {/* Aviso coluna telefone */}
      {filtered.some((d) => !d.telefone_responsavel) && (
        <p className="mt-4 text-xs text-gray-600">
          Alunos sem telefone cadastrado aparecem com o botão WhatsApp desabilitado. Edite o aluno em{" "}
          <a href="/alunos" className="text-orange-400 hover:underline">Alunos</a> para adicionar.
        </p>
      )}
    </>
  );
}
