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

  const extratoLines = pedidos.slice(0, 10).map((p) => {
    const data  = new Date(p.criado_em).toLocaleDateString("pt-BR");
    const itens = p.itens_pedido
      .map((i) => `${i.quantidade > 1 ? i.quantidade + "x " : ""}${i.nome_produto}`)
      .join(", ");
    return `- ${data}: ${itens} - ${fmt(p.total)}`;
  });

  const extrato =
    extratoLines.length > 0
      ? `\n\nExtrato recente:\n${extratoLines.join("\n")}`
      : "";

  const msg =
    `Olá! Passando para informar que o(a) aluno(a) ${nome}, da turma ${turma}, possui um saldo devedor de ${valor} na cantina.` +
    extrato +
    `\n\nPor favor, entre em contato para regularizar. Obrigado!`;

  const base = tel ? `https://wa.me/55${tel}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(msg)}`;
}

function cicloBadge(ciclo: string | null) {
  if (ciclo === "semanal")
    return { label: "📅 Semanal", cls: "bg-violet-400/10 text-violet-300 border-violet-400/20" };
  return { label: "🗓️ Mensal", cls: "bg-sky-400/10 text-sky-300 border-sky-400/20" };
}

// ── componente ────────────────────────────────────────────────────────────────

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.122 1.524 5.855L.057 23.57a.75.75 0 0 0 .921.921l5.716-1.467A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.713 9.713 0 0 1-4.953-1.357l-.355-.212-3.684.945.963-3.617-.231-.373A9.718 9.718 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
  </svg>
);

export default function CobrancasList({
  initialDevedores,
  pedidosPorAluno,
}: {
  initialDevedores: Devedor[];
  pedidosPorAluno: Record<string, PedidoExtrato[]>;
}) {
  const [search,      setSearch]      = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");

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
              const wUrl    = buildWhatsAppUrl(d, pedidos);
              const temTel  = !!(d.telefone_responsavel?.replace(/\D/g, ""));

              const waBtnCls = temTel
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
                : "bg-gray-700 text-gray-400 cursor-not-allowed";
              const waTitle  = temTel
                ? "Enviar cobrança via WhatsApp"
                : "Cadastre o telefone no perfil do aluno";

              return (
                <div
                  key={d.id ?? i}
                  className="grid grid-cols-1 md:grid-cols-[1fr_100px_130px_110px_130px_110px] gap-2 md:gap-4 px-5 py-4 bg-cp-surface hover:bg-cp-elevated transition-colors items-center"
                >
                  {/* Aluno */}
                  <div className="flex items-center justify-between md:justify-start gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.nome}</p>
                      {/* turma no mobile */}
                      <p className="text-xs text-gray-500 mt-0.5 md:hidden">{d.turma ?? "—"}</p>
                    </div>
                    {/* WhatsApp visível no mobile */}
                    <a
                      href={wUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={waTitle}
                      className={`md:hidden shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${waBtnCls}`}
                      onClick={!temTel ? (e) => e.preventDefault() : undefined}
                    >
                      {WHATSAPP_ICON}
                      WhatsApp
                    </a>
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

                  {/* WhatsApp (desktop) */}
                  <a
                    href={wUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={waTitle}
                    className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all w-fit ${waBtnCls}`}
                    onClick={!temTel ? (e) => e.preventDefault() : undefined}
                  >
                    {WHATSAPP_ICON}
                    WhatsApp
                  </a>
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
