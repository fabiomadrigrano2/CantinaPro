"use client";

import { useEffect, useState } from "react";
import { WHATSAPP_ICON } from "@/components/cobrancas/CobrancasList";

// ── tipos ─────────────────────────────────────────────────────────────────────

export type AlunoAlertaSaldo = {
  id: string;
  nome: string;
  turma: string | null;
  saldo: number;
  limite: number;
  nomeResponsavel: string | null;
  telefoneResponsavel: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })
      .format(new Date())
  );
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

function buildMensagem(aluno: AlunoAlertaSaldo): string {
  const resp = aluno.nomeResponsavel?.trim();
  return (
    `${saudacao()}${resp ? ` ${resp}` : ""}!\n` +
    `O saldo do(a) ${aluno.nome} está em ${fmt(aluno.saldo)}.\n` +
    `Para continuar comprando normalmente, pedimos que efetue uma recarga.\n` +
    `Minha chave pix é meu celular 11958890917\n` +
    `Obrigado! 🙏`
  );
}

function buildWhatsAppUrl(tel: string, message: string): string {
  const telClean = tel.replace(/\D/g, "");
  const base = telClean ? `https://wa.me/55${telClean}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

// ── modal de revisão da mensagem ──────────────────────────────────────────────

function AvisoWhatsAppModal({
  aluno,
  onClose,
}: {
  aluno: AlunoAlertaSaldo;
  onClose: () => void;
}) {
  const [mensagemOriginal] = useState(() => buildMensagem(aluno));
  const [msg, setMsg] = useState(mensagemOriginal);
  const waUrl = buildWhatsAppUrl(aluno.telefoneResponsavel ?? "", msg);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white leading-tight break-words">{aluno.nome}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="text-sm text-gray-500">
                Responsável: {aluno.nomeResponsavel?.trim() || "—"}
              </span>
              <span className={`text-sm font-bold tabular-nums ${aluno.saldo < 0 ? "text-red-400" : "text-amber-400"}`}>
                Saldo {fmt(aluno.saldo)}
              </span>
            </div>
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

        <div className="p-5 flex flex-col gap-2 flex-1 overflow-hidden">
          <p className="text-xs text-gray-500 shrink-0">Revise a mensagem antes de enviar:</p>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            className="flex-1 min-h-[200px] w-full bg-cp-elevated border border-cp-border rounded-xl p-4 text-sm text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 border-t border-cp-border shrink-0">
          <button
            onClick={() => setMsg(mensagemOriginal)}
            className="min-h-[44px] text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Restaurar original
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 ml-auto">
            <button
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
            >
              Cancelar
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-all shadow shadow-emerald-500/20"
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

// ── componente ────────────────────────────────────────────────────────────────

export default function AlertasSaldoBaixoSection({ alunos }: { alunos: AlunoAlertaSaldo[] }) {
  const [avisando, setAvisando] = useState<AlunoAlertaSaldo | null>(null);

  if (alunos.length === 0) return null;

  return (
    <section>
      {avisando && <AvisoWhatsAppModal aluno={avisando} onClose={() => setAvisando(null)} />}

      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          Alertas de saldo baixo
        </h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-amber-400 bg-amber-400/10 border-amber-400/20">
          {alunos.length}
        </span>
      </div>

      <div className="space-y-2">
        {alunos.map((a) => {
          const temTel = !!a.telefoneResponsavel?.replace(/\D/g, "");
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-surface hover:bg-cp-elevated transition-colors"
            >
              <div className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center shrink-0 text-sm bg-amber-400/10 text-amber-400">
                🔔
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white break-words">{a.nome}</p>
                <p className="text-xs text-gray-500 mt-0.5">{a.turma ?? "—"}</p>
              </div>

              <div className="text-right shrink-0">
                <p className={`text-sm font-bold tabular-nums ${a.saldo < 0 ? "text-red-400" : "text-amber-400"}`}>
                  {fmt(a.saldo)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                  limite {fmt(a.limite)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAvisando(a)}
                disabled={!temTel}
                title={temTel ? "Revisar mensagem e avisar no WhatsApp" : "Cadastre o telefone do responsável no perfil do aluno"}
                className="shrink-0 min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm sm:text-xs font-semibold transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow shadow-emerald-500/20 disabled:bg-cp-elevated disabled:text-gray-600 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {WHATSAPP_ICON}
                <span className="sm:hidden">Avisar</span>
                <span className="hidden sm:inline">Avisar no WhatsApp</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
