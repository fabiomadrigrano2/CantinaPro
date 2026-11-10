"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarExtratoAluno } from "@/app/cobrancas/actions";
import {
  CamposPeriodo, PERIODOS, getPeriodo, intervaloInicial, todayBR, validarIntervalo,
  type Intervalo, type Periodo,
} from "@/components/cobrancas/ExtratoDetalhadoModal";
import { baixarExtratoPdf } from "@/lib/extratoPdf";

export default function ExtratoPdfModal({
  aluno,
  onClose,
}: {
  aluno: { id: string; nome: string; turma: string | null };
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [gerando, setGerando] = useState<Periodo | null>(null);
  const hoje = useMemo(() => todayBR(), []);
  const [escolhendo, setEscolhendo] = useState(false);
  const [personalizado, setPersonalizado] = useState<Intervalo>(() => intervaloInicial(hoje));
  const erroIntervalo = validarIntervalo(personalizado);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Busca consumo e pagamentos só do período escolhido, no clique
  async function handleBaixar(id: Periodo) {
    const periodo = getPeriodo(id, hoje, personalizado);
    setGerando(id);
    setError(null);
    try {
      const result = await buscarExtratoAluno(aluno.id, periodo.inicio, periodo.fim);
      if (result.error || !result.extrato) {
        setError(result.error ?? "Falha ao carregar o extrato.");
        return;
      }
      await baixarExtratoPdf({
        cantina:      result.extrato.cantina,
        nomeAluno:    aluno.nome,
        turma:        aluno.turma,
        periodoLabel: periodo.titulo,
        inicio:       periodo.inicio,
        fim:          periodo.fim,
        extrato:      result.extrato,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerando(null);
    }
  }

  const spinner = (
    <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin shrink-0" />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-cp-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white leading-tight">📄 Extrato em PDF</h2>
            <p className="text-sm text-gray-500 mt-1 break-words">{aluno.nome}</p>
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

        <div className="p-5 space-y-2">
          <p className="text-sm text-gray-500 mb-3">Escolha o período para baixar:</p>
          {PERIODOS.filter((p) => p.id !== "personalizado").map((p) => {
            const periodo = getPeriodo(p.id, hoje);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleBaixar(p.id)}
                disabled={gerando !== null}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-elevated text-left transition-all hover:border-orange-500/50 hover:bg-orange-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{p.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{periodo.label}</p>
                </div>
                {gerando === p.id ? spinner : (
                  <span className="text-sm font-semibold text-orange-400 shrink-0">Baixar</span>
                )}
              </button>
            );
          })}

          <div className="rounded-xl border border-cp-border bg-cp-elevated">
            <button
              type="button"
              onClick={() => setEscolhendo((v) => !v)}
              aria-expanded={escolhendo}
              className="w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <p className="text-sm font-semibold text-white">Escolher período</p>
              <span className="text-sm text-gray-500 shrink-0">{escolhendo ? "▲" : "▼"}</span>
            </button>
            {escolhendo && (
              <div className="px-4 pb-4 space-y-3">
                <CamposPeriodo valor={personalizado} onChange={setPersonalizado} erro={erroIntervalo} />
                <button
                  type="button"
                  onClick={() => handleBaixar("personalizado")}
                  disabled={gerando !== null || !!erroIntervalo}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {gerando === "personalizado" && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  Baixar PDF do período
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400 pt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
