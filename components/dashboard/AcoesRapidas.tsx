"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FichaAlunoModal, { type AlunoFicha } from "@/components/alunos/FichaAlunoModal";
import { ResumaoModal } from "@/components/cobrancas/ResumaoSemana";
import { buscarDadosResumao } from "@/app/cobrancas/actions";
import type { DadosCobrancas } from "@/lib/cobrancasDados";
import { listarCorrecoesVoz } from "@/app/configuracoes/actions";
import {
  aplicarCorrecoesVoz, fuzzyMatchAluno, normalizeStr, type CorrecaoVoz,
} from "@/lib/vozComando";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const BOTAO_GRANDE =
  "w-full min-h-[80px] flex items-center gap-4 px-5 rounded-2xl font-semibold transition-all active:scale-[0.98]";

// ── ações do topo do Dashboard ────────────────────────────────────────────────

export default function AcoesRapidas({ alunos }: { alunos: AlunoFicha[] }) {
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [fichaAluno, setFichaAluno] = useState<AlunoFicha | null>(null);
  const [resumao, setResumao] = useState<DadosCobrancas | null>(null);
  const [carregandoResumao, setCarregandoResumao] = useState(false);
  const [erroResumao, setErroResumao] = useState<string | null>(null);

  async function abrirResumao() {
    setCarregandoResumao(true);
    setErroResumao(null);
    try {
      setResumao(await buscarDadosResumao());
    } catch {
      setErroResumao("Não foi possível carregar o Resumão. Tente novamente.");
    } finally {
      setCarregandoResumao(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* 1. Nova venda — destaque */}
        <Link
          href="/vendas/nova"
          className={`${BOTAO_GRANDE} min-h-[96px] bg-orange-500 hover:bg-orange-600 text-white text-2xl shadow-lg shadow-orange-500/25`}
        >
          <span className="w-12 h-12 shrink-0 rounded-xl bg-white/15 flex items-center justify-center text-3xl leading-none">+</span>
          Nova venda
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 2. Resumão da semana */}
          <button
            onClick={abrirResumao}
            disabled={carregandoResumao}
            className={`${BOTAO_GRANDE} bg-cp-surface border border-cp-border hover:border-orange-500/40 text-white text-lg disabled:opacity-60`}
          >
            <span className="text-3xl shrink-0">📊</span>
            {carregandoResumao ? "Carregando..." : "Resumão da semana"}
          </button>

          {/* 3. Buscar aluno */}
          <button
            onClick={() => setBuscaAberta(true)}
            className={`${BOTAO_GRANDE} bg-cp-surface border border-cp-border hover:border-orange-500/40 text-white text-lg`}
          >
            <span className="text-3xl shrink-0">🔎</span>
            Buscar aluno
          </button>
        </div>

        {erroResumao && <p className="text-sm text-red-400">{erroResumao}</p>}
      </div>

      {resumao && (
        <ResumaoModal
          devedores={resumao.devedores}
          alunosSemanais={resumao.alunosSemanais}
          ciclosSemanaisPorAluno={resumao.ciclosSemanaisPorAluno}
          consumoSemana={resumao.consumoSemana}
          onClose={() => setResumao(null)}
        />
      )}

      {buscaAberta && (
        <BuscaAlunoModal
          alunos={alunos}
          onClose={() => setBuscaAberta(false)}
          onSelect={(a) => { setBuscaAberta(false); setFichaAluno(a); }}
        />
      )}

      {fichaAluno && (
        <FichaAlunoModal aluno={fichaAluno} onClose={() => setFichaAluno(null)} />
      )}
    </>
  );
}

// ── busca de aluno (texto ou voz) ─────────────────────────────────────────────

function BuscaAlunoModal({
  alunos,
  onClose,
  onSelect,
}: {
  alunos: AlunoFicha[];
  onClose: () => void;
  onSelect: (a: AlunoFicha) => void;
}) {
  const [busca, setBusca] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [erroVoz, setErroVoz] = useState<string | null>(null);
  const [correcoes, setCorrecoes] = useState<CorrecaoVoz[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    inputRef.current?.focus();
    listarCorrecoesVoz().then(setCorrecoes).catch(() => setCorrecoes([]));
    return () => recognitionRef.current?.abort?.();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const resultados = useMemo(() => {
    const q = normalizeStr(busca.trim());
    if (!q) return alunos.slice(0, 30);
    return alunos
      .filter((a) => normalizeStr(a.nome).includes(q) || normalizeStr(a.turma ?? "").includes(q))
      .slice(0, 30);
  }, [busca, alunos]);

  // Mesmo reconhecimento da Nova Venda (pt-BR + correções do Treinamento de
  // Voz), mas só um nome: para na primeira frase em vez de esperar silêncio.
  function startVoz() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErroVoz("Reconhecimento de voz não suportado. Use Chrome ou Edge.");
      return;
    }
    setErroVoz(null);
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let transcript = "";
    rec.onstart = () => setOuvindo(true);
    rec.onresult = (e: any) => {
      transcript = e.results[0]?.[0]?.transcript ?? "";
    };
    rec.onend = () => {
      setOuvindo(false);
      const texto = aplicarCorrecoesVoz(transcript.trim(), correcoes);
      if (!texto) return;
      const aluno = fuzzyMatchAluno(texto, alunos);
      if (aluno) onSelect(aluno);
      else {
        setBusca(texto);
        setErroVoz(`Nenhum aluno encontrado para "${texto}".`);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      setOuvindo(false);
      setErroVoz("Não foi possível capturar o áudio. Tente novamente.");
    };
    rec.start();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar aluno"
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[84vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-cp-border shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="search"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setErroVoz(null); }}
              placeholder="Nome ou turma do aluno..."
              className="flex-1 min-w-0 min-h-[56px] px-4 rounded-xl bg-cp-elevated border border-cp-border text-white text-lg placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
            />
            <button
              onClick={startVoz}
              disabled={ouvindo}
              aria-label="Buscar por voz"
              className={`shrink-0 w-14 min-h-[56px] rounded-xl flex items-center justify-center text-2xl transition-all ${
                ouvindo
                  ? "bg-orange-500 text-white animate-pulse"
                  : "bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/25"
              }`}
            >
              🎤
            </button>
          </div>
          {ouvindo && <p className="text-sm text-orange-300 mt-2">Ouvindo... fale o nome do aluno</p>}
          {erroVoz && <p className="text-sm text-red-400 mt-2">{erroVoz}</p>}
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-cp-border">
          {resultados.length === 0 ? (
            <li className="px-5 py-8 text-center text-gray-500">Nenhum aluno encontrado.</li>
          ) : (
            resultados.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onSelect(a)}
                  className="w-full min-h-[60px] flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-cp-elevated transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-white break-words">{a.nome}</span>
                    <span className="block text-sm text-gray-500">{a.turma ? `Turma ${a.turma}` : "Sem turma"}</span>
                  </span>
                  <span
                    className={`shrink-0 text-base font-bold tabular-nums ${
                      a.saldo < 0 ? "text-red-400" : "text-gray-300"
                    }`}
                  >
                    {fmt(a.saldo)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="p-3 border-t border-cp-border shrink-0">
          <button
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl text-gray-400 hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
