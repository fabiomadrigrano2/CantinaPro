"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarExtratoAluno, type PedidoExtrato } from "@/app/cobrancas/actions";
import {
  PERIODOS, getPeriodo, todayBR, toBRDateStr, type Periodo,
} from "@/components/cobrancas/ExtratoDetalhadoModal";
import { baixarExtratoPdf } from "@/lib/extratoPdf";

export default function ExtratoPdfModal({
  aluno,
  onClose,
}: {
  aluno: { id: string; nome: string; turma: string | null };
  onClose: () => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoExtrato[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gerando, setGerando] = useState<Periodo | null>(null);
  const hoje = useMemo(() => todayBR(), []);

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

  async function handleBaixar(id: Periodo) {
    if (!pedidos) return;
    const periodo = getPeriodo(id, hoje);
    setGerando(id);
    setError(null);
    try {
      await baixarExtratoPdf({
        nomeAluno:    aluno.nome,
        turma:        aluno.turma,
        // o PDF já imprime as datas; tira o "(dd/mm a dd/mm)" do rótulo
        periodoLabel: periodo.label.replace(/ \(.*\)$/, ""),
        inicio:       periodo.inicio,
        fim:          periodo.fim,
        pedidos:      pedidos.filter((p) => {
          const dia = toBRDateStr(p.criado_em);
          return dia >= periodo.inicio && dia <= periodo.fim;
        }),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cp-surface border border-cp-border rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-cp-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white leading-tight">📄 Extrato em PDF</h2>
            <p className="text-sm text-gray-500 mt-1 truncate">{aluno.nome}</p>
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

        <div className="p-5 space-y-2">
          <p className="text-xs text-gray-500 mb-3">Escolha o período para baixar:</p>
          {PERIODOS.map((p) => {
            const periodo = getPeriodo(p.id, hoje);
            const carregando = pedidos === null && !error;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleBaixar(p.id)}
                disabled={carregando || gerando !== null || !pedidos}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-elevated text-left transition-all hover:border-orange-500/50 hover:bg-orange-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{p.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{periodo.label}</p>
                </div>
                {gerando === p.id ? (
                  <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <span className="text-xs font-semibold text-orange-400 shrink-0">Baixar</span>
                )}
              </button>
            );
          })}

          {pedidos === null && !error && (
            <p className="text-xs text-gray-600 text-center pt-1">Carregando consumos…</p>
          )}
          {error && <p className="text-xs text-red-400 pt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
