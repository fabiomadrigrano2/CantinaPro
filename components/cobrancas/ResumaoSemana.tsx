"use client";

import { useEffect, useMemo, useState } from "react";
import type { CicloSemana } from "@/types/cobrancas";
import {
  ExtratoModal, WHATSAPP_ICON, buildMessageSemanal, type Devedor,
} from "@/components/cobrancas/CobrancasList";
import { todayBR } from "@/components/cobrancas/ExtratoDetalhadoModal";
import { baixarResumaoPdf } from "@/lib/resumaoPdf";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function dataBR(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function addDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().split("T")[0];
}

// Segunda-feira da semana de uma data YYYY-MM-DD
function inicioSemana(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDias(ymd, dow === 0 ? -6 : 1 - dow);
}

// Próxima ocorrência do dia de cobrança mensal (hoje inclusive)
function proximaCobranca(hoje: string, dia: number): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const dt = dia >= d ? new Date(Date.UTC(y, m - 1, dia)) : new Date(Date.UTC(y, m, dia));
  return dt.toISOString().split("T")[0];
}

function buildMessageMensal(devedor: Devedor): string {
  const nomeResp = devedor.nome_responsavel ?? devedor.nome.split(" ")[0];
  return (
    `Boa Tarde ${nomeResp} tudo bem com você?\n` +
    `O total do(a) ${devedor.nome} em aberto na cantina é de ${fmt(Math.abs(devedor.saldo))}.\n` +
    `Minha chave pix é meu celular 11958890917` +
    `\nMuito obrigado !`
  );
}

type LinhaSemanal = {
  devedor: Devedor;
  ciclos: CicloSemana[];
  valorSemana: number;
  valorAnterior: number;
  total: number;
};

type LinhaMensal = {
  devedor: Devedor;
  total: number;
  cobraHoje: boolean;
  dataCombinada: string;
};

// ── botão + modal ─────────────────────────────────────────────────────────────

export default function ResumaoSemana({
  devedores,
  ciclosSemanaisPorAluno,
  consumoSemana,
}: {
  devedores: Devedor[];
  ciclosSemanaisPorAluno: Record<string, CicloSemana[]>;
  // todos os pedidos confirmados desde segunda 00:00 (BRT), calculado no servidor
  consumoSemana: number;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-orange-500 hover:bg-orange-600 text-white shadow shadow-orange-500/20 shrink-0"
      >
        <span>📊</span>
        Resumão da Semana
      </button>

      {aberto && (
        <ResumaoModal
          devedores={devedores}
          ciclosSemanaisPorAluno={ciclosSemanaisPorAluno}
          consumoSemana={consumoSemana}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}

function ResumaoModal({
  devedores,
  ciclosSemanaisPorAluno,
  consumoSemana,
  onClose,
}: {
  devedores: Devedor[];
  ciclosSemanaisPorAluno: Record<string, CicloSemana[]>;
  consumoSemana: number;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{ devedor: Devedor; initialMessage: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoje = useMemo(() => todayBR(), []);
  const semanaInicio = inicioSemana(hoje);
  const semanaFim = addDias(semanaInicio, 6);
  const diaHoje = Number(hoje.split("-")[2]);

  // Semanais: devedores que consumiram na semana atual (ciclo atual ainda não cobrado)
  const semanais = useMemo<LinhaSemanal[]>(() => {
    return devedores
      .filter((d) => d.ciclo_cobranca === "semanal")
      .flatMap((d) => {
        const ciclos = ciclosSemanaisPorAluno[d.id] ?? [];
        const atual = ciclos.find((c) => c.is_current);
        if (!atual || atual.total <= 0) return [];
        const total = Math.abs(d.saldo);
        return [{
          devedor: d,
          ciclos,
          valorSemana: atual.total,
          // tudo que não é desta semana: semanas anteriores + saldo pré-app
          valorAnterior: Math.max(0, total - atual.total),
          total,
        }];
      })
      .sort((a, b) => a.devedor.nome.localeCompare(b.devedor.nome));
  }, [devedores, ciclosSemanaisPorAluno]);

  // Mensais: todo devedor mensal (saldo negativo); quem tem cobrança hoje vem primeiro.
  // Sem ciclo definido conta como mensal, que é o padrão do cadastro.
  const mensais = useMemo<LinhaMensal[]>(() => {
    return devedores
      .filter((d) => d.ciclo_cobranca !== "semanal")
      .map((d) => {
        const cobraHoje = d.dia_cobranca === diaHoje;
        const dataCombinada =
          d.dia_cobranca == null
            ? "Sem data"
            : cobraHoje
              ? `Hoje (dia ${d.dia_cobranca})`
              : dataBR(proximaCobranca(hoje, d.dia_cobranca));
        return { devedor: d, total: Math.abs(d.saldo), cobraHoje, dataCombinada };
      })
      .sort((a, b) =>
        Number(b.cobraHoje) - Number(a.cobraHoje) || a.devedor.nome.localeCompare(b.devedor.nome)
      );
  }, [devedores, diaHoje, hoje]);

  // Totais do rodapé. "Total semanais" inclui semanais sem consumo nesta semana
  // (só dívida anterior), que não aparecem na lista; assim semanais + mensais
  // fecha com "Total de débitos", que é o mesmo total da aba Cobranças.
  const devedoresSemanais = devedores.filter((d) => d.ciclo_cobranca === "semanal");
  // consumo de toda a cantina na semana (semanais, mensais e avulsos), não só da lista
  const consumidoSemana   = consumoSemana;
  const totalSemanais     = devedoresSemanais.reduce((s, d) => s + Math.abs(d.saldo), 0);
  const totalMensais      = mensais.reduce((s, l) => s + l.total, 0);
  const totalDebitos      = devedores.reduce((s, d) => s + Math.abs(d.saldo), 0);
  const semanaisForaLista = devedoresSemanais.length - semanais.length;
  const valorForaLista    = totalSemanais - semanais.reduce((s, l) => s + l.total, 0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && !preview && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, preview]);

  async function handleExportar() {
    setGerando(true);
    setError(null);
    try {
      await baixarResumaoPdf({
        hoje,
        semanaInicio,
        semanaFim,
        semanais: semanais.map((l) => ({
          nome: l.devedor.nome,
          turma: l.devedor.turma,
          valorSemana: l.valorSemana,
          valorAnterior: l.valorAnterior,
          total: l.total,
        })),
        mensais: mensais.map((l) => ({
          nome: l.devedor.nome,
          turma: l.devedor.turma,
          total: l.total,
          dataCombinada: l.dataCombinada,
        })),
        semanaisForaLista,
        valorForaLista,
        totais: { consumidoSemana, totalSemanais, totalMensais, totalDebitos },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resumao-titulo"
          className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between p-5 border-b border-cp-border shrink-0">
            <div>
              <h2 id="resumao-titulo" className="text-base font-semibold text-white">📊 Resumão da Semana</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Semana {dataBR(semanaInicio)} → {dataBR(semanaFim)} · hoje {dataBR(hoje)}
              </p>
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
          <div className="p-5 flex flex-col gap-6 flex-1 overflow-y-auto">
            {/* Seção 1 — Semanais */}
            <section>
              <SecaoTitulo titulo="Semanais" qtd={semanais.length} cor="blue" />
              {semanais.length === 0 ? (
                <Vazio texto="Nenhum aluno semanal com consumo em aberto nesta semana." />
              ) : (
                <ul className="rounded-xl border border-cp-border divide-y divide-cp-border overflow-hidden">
                  {semanais.map((l) => (
                    <li key={l.devedor.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-cp-elevated/40">
                      <AlunoInfo devedor={l.devedor} />
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400 tabular-nums">
                          Semana <span className="text-gray-200 font-medium">{fmt(l.valorSemana)}</span>
                        </p>
                        {l.valorAnterior > 0 && (
                          <p className="text-xs text-amber-300/90 tabular-nums mt-0.5">
                            + anteriores {fmt(l.valorAnterior)}
                          </p>
                        )}
                      </div>
                      <span className="w-24 text-right text-sm font-bold text-red-400 tabular-nums shrink-0">
                        {fmt(l.total)}
                      </span>
                      <WhatsAppBtn
                        devedor={l.devedor}
                        onClick={() =>
                          setPreview({ devedor: l.devedor, initialMessage: buildMessageSemanal(l.devedor, l.ciclos) })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {semanaisForaLista > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  + {semanaisForaLista} aluno{semanaisForaLista !== 1 ? "s" : ""} semana{semanaisForaLista !== 1 ? "is" : "l"} sem
                  consumo nesta semana, com <span className="text-amber-300/90 tabular-nums">{fmt(valorForaLista)}</span> de
                  semanas anteriores (incluído em Total semanais).
                </p>
              )}
            </section>

            {/* Seção 2 — Mensais */}
            <section>
              <SecaoTitulo titulo="Mensais" qtd={mensais.length} cor="purple" />
              {mensais.length === 0 ? (
                <Vazio texto="Nenhum aluno mensal com cobrança hoje ou saldo negativo." />
              ) : (
                <ul className="rounded-xl border border-cp-border divide-y divide-cp-border overflow-hidden">
                  {mensais.map((l) => (
                    <li key={l.devedor.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-cp-elevated/40">
                      <AlunoInfo devedor={l.devedor} />
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium tabular-nums ${
                          l.cobraHoje
                            ? "bg-orange-400/10 text-orange-300 border-orange-400/25"
                            : "bg-cp-elevated text-gray-400 border-cp-border"
                        }`}
                      >
                        📅 {l.dataCombinada}
                      </span>
                      <span className="w-24 text-right text-sm font-bold text-red-400 tabular-nums shrink-0">
                        {fmt(l.total)}
                      </span>
                      <WhatsAppBtn
                        devedor={l.devedor}
                        onClick={() =>
                          setPreview({ devedor: l.devedor, initialMessage: buildMessageMensal(l.devedor) })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Rodapé */}
          <div className="border-t border-cp-border shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-cp-border">
              <Total label="Consumido na semana" valor={consumidoSemana} />
              <Total label="Total semanais" valor={totalSemanais} />
              <Total label="Total mensais" valor={totalMensais} />
              <Total label="Total de débitos" valor={totalDebitos} destaque />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-cp-border">
              <p className="text-xs text-red-400 min-w-0 truncate">{error}</p>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
                >
                  Fechar
                </button>
                <button
                  onClick={handleExportar}
                  disabled={gerando}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-cp-elevated border border-cp-border text-gray-200 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>📄</span>
                  {gerando ? "Gerando..." : "Exportar PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <ExtratoModal
          devedor={preview.devedor}
          initialMessage={preview.initialMessage}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

// ── peças ─────────────────────────────────────────────────────────────────────

function SecaoTitulo({ titulo, qtd, cor }: { titulo: string; qtd: number; cor: "blue" | "purple" }) {
  const badge =
    cor === "blue"
      ? "bg-blue-400/10 text-blue-300 border-blue-400/20"
      : "bg-purple-400/10 text-purple-300 border-purple-400/20";
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{titulo}</h3>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge}`}>{qtd}</span>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="px-4 py-6 text-sm text-gray-500 text-center rounded-xl border border-dashed border-cp-border">
      {texto}
    </p>
  );
}

function AlunoInfo({ devedor }: { devedor: Devedor }) {
  return (
    <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
      <p className="text-sm font-medium text-white truncate">{devedor.nome}</p>
      <p className="text-xs text-gray-500 mt-0.5">{devedor.turma ? `Turma ${devedor.turma}` : "Sem turma"}</p>
    </div>
  );
}

function WhatsAppBtn({ devedor, onClick }: { devedor: Devedor; onClick: () => void }) {
  const temTel = !!devedor.telefone_responsavel?.replace(/\D/g, "");
  return (
    <button
      onClick={temTel ? onClick : undefined}
      disabled={!temTel}
      title={temTel ? "Ver prévia e enviar via WhatsApp" : "Cadastre o telefone no perfil do aluno"}
      aria-label="Cobrar no WhatsApp"
      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        temTel
          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20"
          : "bg-gray-700 text-gray-400 cursor-not-allowed"
      }`}
    >
      {WHATSAPP_ICON}
      <span className="hidden sm:inline">Cobrar</span>
    </button>
  );
}

function Total({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    // fundo sólido cobre o gap-px da grade; o destaque laranja vai por cima como gradiente
    <div className={`px-3 sm:px-5 py-3 bg-cp-surface ${destaque ? "bg-gradient-to-r from-orange-500/10 to-orange-500/10" : ""}`}>
      <p className={`text-xs ${destaque ? "text-orange-300" : "text-gray-500"}`}>{label}</p>
      <p className={`text-base font-bold tabular-nums ${destaque ? "text-orange-400" : "text-white"}`}>
        {fmt(valor)}
      </p>
    </div>
  );
}
