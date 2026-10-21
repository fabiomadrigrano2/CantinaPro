"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listarCorrecoesVoz } from "@/app/configuracoes/actions";
import {
  previaAcaoVoz, executarAcaoVoz, desfazerAcaoVoz, listarAcoesVoz,
  type PreviaVoz, type AcaoVozRecente,
} from "@/app/dashboard/vozActions";
import {
  interpretarComandoCentral, type FormaPagamento, type IntencaoVoz, type TipoAcaoVoz,
} from "@/lib/centralVoz";
import type { CorrecaoVoz } from "@/lib/vozComando";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

const DESFAZER_SEGUNDOS = 60;

const ROTULO: Record<IntencaoVoz, string> = {
  abater: "Abater pagamento",
  credito: "Adicionar crédito",
  quitar: "Quitar conta",
  consulta: "Consultar saldo",
};

const ROTULO_CURTO: Record<TipoAcaoVoz, string> = {
  abater: "Abatido",
  credito: "Crédito",
  quitar: "Quitação",
};

const FORMAS: { id: FormaPagamento; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix",      label: "Pix" },
  { id: "cartao",   label: "Cartão" },
];

function frasesFeito(p: PreviaVoz): string {
  if (p.intencao === "abater")  return `${fmt(p.valor)} abatidos da conta de ${p.nome}`;
  if (p.intencao === "credito") return `${fmt(p.valor)} de crédito para ${p.nome}`;
  return `Conta de ${p.nome} quitada (${fmt(p.valor)})`;
}

const saldoCls = (v: number) => (v < 0 ? "text-red-400" : v > 0 ? "text-emerald-400" : "text-gray-300");

type AlunoVoz = { id: string; nome: string; turma: string | null };

type Etapa =
  | { tipo: "idle" }
  | { tipo: "ouvindo"; parcial: string }
  | { tipo: "carregando"; texto: string }
  | { tipo: "erro"; texto: string | null; mensagem: string }
  | {
      tipo: "escolher"; texto: string; intencao: IntencaoVoz; valor: number | null;
      forma: FormaPagamento | null; candidatos: AlunoVoz[];
    }
  | { tipo: "consulta"; texto: string; previa: PreviaVoz }
  | { tipo: "confirmar"; texto: string; previa: PreviaVoz; forma: FormaPagamento; executando: boolean; erro: string | null };

type Feito = {
  acaoId: string | null;
  previa: PreviaVoz;
  saldoDepois: number;
  expiraEm: number;
  aviso: string | null;
};

type Aviso = { tipo: "ok" | "erro" | "conflito"; texto: string };

// ── componente ────────────────────────────────────────────────────────────────

export default function CentralVoz({ alunos }: { alunos: AlunoVoz[] }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "idle" });
  const [correcoes, setCorrecoes] = useState<CorrecaoVoz[]>([]);
  const [digitado, setDigitado] = useState("");
  const [feito, setFeito] = useState<Feito | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [acoes, setAcoes] = useState<AcaoVozRecente[]>([]);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const recognitionRef = useRef<any>(null);

  const recarregarAcoes = useCallback(async () => {
    try {
      const r = await listarAcoesVoz();
      setAcoes(r.acoes);
      setErroLista(r.error ?? null);
    } catch {
      setErroLista("Não foi possível carregar as últimas ações.");
    }
  }, []);

  useEffect(() => {
    listarCorrecoesVoz().then(setCorrecoes).catch(() => setCorrecoes([]));
    recarregarAcoes();
    return () => recognitionRef.current?.abort?.();
  }, [recarregarAcoes]);

  // Relógio do aviso "Desfazer"
  useEffect(() => {
    if (!feito) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [feito]);
  useEffect(() => {
    if (feito && agora >= feito.expiraEm) setFeito(null);
  }, [agora, feito]);

  // ── interpretação ─────────────────────────────────────────────────────────

  async function carregarPrevia(
    texto: string, aluno: AlunoVoz, intencao: IntencaoVoz, valor: number | null, forma: FormaPagamento | null,
  ) {
    setEtapa({ tipo: "carregando", texto });
    try {
      const r = await previaAcaoVoz({ alunoId: aluno.id, intencao, valor });
      if (!r.previa) {
        setEtapa({ tipo: "erro", texto, mensagem: r.error ?? "Não foi possível consultar o aluno." });
        return;
      }
      if (intencao === "consulta") setEtapa({ tipo: "consulta", texto, previa: r.previa });
      else setEtapa({
        tipo: "confirmar", texto, previa: r.previa, forma: forma ?? "dinheiro", executando: false, erro: null,
      });
    } catch {
      setEtapa({ tipo: "erro", texto, mensagem: "Falha de conexão. Tente de novo." });
    }
  }

  function processar(textoBruto: string) {
    const texto = textoBruto.trim();
    if (!texto) {
      setEtapa({ tipo: "erro", texto: null, mensagem: "Não ouvi nada. Toque no microfone e fale de novo." });
      return;
    }
    const cmd = interpretarComandoCentral(texto, alunos, correcoes);
    if (!cmd.ok) {
      setEtapa({ tipo: "erro", texto: cmd.textoCorrigido, mensagem: cmd.erro });
      return;
    }
    if (cmd.candidatos.length > 1) {
      setEtapa({
        tipo: "escolher", texto: cmd.textoCorrigido, intencao: cmd.intencao, valor: cmd.valor,
        forma: cmd.formaPagamento, candidatos: cmd.candidatos,
      });
      return;
    }
    carregarPrevia(cmd.textoCorrigido, cmd.candidatos[0], cmd.intencao, cmd.valor, cmd.formaPagamento);
  }

  // ── microfone ─────────────────────────────────────────────────────────────

  function ouvir() {
    if (etapa.tipo === "ouvindo") {
      recognitionRef.current?.stop?.();
      return;
    }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setEtapa({
        tipo: "erro", texto: null,
        mensagem: "Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge, ou digite o comando abaixo.",
      });
      return;
    }
    setAviso(null);
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let final = "";
    let falhou = false;
    rec.onstart = () => setEtapa({ tipo: "ouvindo", parcial: "" });
    rec.onresult = (e: any) => {
      let parcial = "";
      final = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) final += t;
        else parcial += t;
      }
      setEtapa({ tipo: "ouvindo", parcial: (final + " " + parcial).trim() });
    };
    rec.onerror = (e: any) => {
      falhou = true;
      const mensagem =
        e.error === "no-speech" ? "Não ouvi nada. Toque no microfone e fale de novo." :
        e.error === "not-allowed" ? "Permita o uso do microfone no navegador para usar o Modo Na Correria." :
        "Não foi possível capturar o áudio. Tente novamente.";
      setEtapa({ tipo: "erro", texto: null, mensagem });
    };
    rec.onend = () => {
      recognitionRef.current = null;
      if (!falhou) processar(final);
    };
    rec.start();
  }

  // ── confirmar / desfazer ──────────────────────────────────────────────────

  async function confirmar() {
    if (etapa.tipo !== "confirmar" || etapa.executando) return;
    const atual = etapa;
    setEtapa({ ...atual, executando: true, erro: null });
    try {
      const r = await executarAcaoVoz({
        alunoId: atual.previa.alunoId,
        tipo: atual.previa.intencao as TipoAcaoVoz,
        valor: atual.previa.valor,
        formaPagamento: atual.forma,
        saldoEsperado: atual.previa.saldoAntes,
        textoFalado: atual.texto,
      });
      if (r.error) {
        setEtapa({ ...atual, executando: false, erro: r.error });
        return;
      }
      setFeito({
        acaoId: r.acaoId ?? null,
        previa: atual.previa,
        saldoDepois: r.saldoDepois ?? atual.previa.saldoDepois,
        expiraEm: Date.now() + DESFAZER_SEGUNDOS * 1000,
        aviso: r.aviso ?? null,
      });
      setAgora(Date.now());
      setEtapa({ tipo: "idle" });
      setDigitado("");
      recarregarAcoes();
      router.refresh();
    } catch {
      setEtapa({ ...atual, executando: false, erro: "Falha de conexão. Confira em Últimas ações se foi registrada antes de tentar de novo." });
      recarregarAcoes();
    }
  }

  async function desfazer(acaoId: string) {
    if (desfazendo) return;
    setDesfazendo(acaoId);
    setAviso(null);
    try {
      const r = await desfazerAcaoVoz(acaoId);
      if (r.ok) {
        setAviso({ tipo: "ok", texto: "Ação desfeita. Saldo, semanas e pagamento voltaram ao estado anterior." });
        if (feito?.acaoId === acaoId) setFeito(null);
        router.refresh();
      } else if (r.conflito) {
        setAviso({ tipo: "conflito", texto: `Não dá para desfazer automaticamente: ${r.conflito}` });
      } else {
        setAviso({ tipo: "erro", texto: r.error ?? "Não foi possível desfazer." });
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Falha de conexão ao desfazer. Tente de novo." });
    } finally {
      setDesfazendo(null);
      recarregarAcoes();
    }
  }

  const ouvindo = etapa.tipo === "ouvindo";
  const restante = feito ? Math.max(0, Math.ceil((feito.expiraEm - agora) / 1000)) : 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <section className="bg-cp-surface border border-orange-500/25 rounded-2xl p-5 space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white">🎙️ Modo Na Correria</h2>
        <p className="text-sm text-gray-500 mt-0.5">Abater, adicionar crédito, quitar ou consultar saldo</p>
      </div>

      {/* Microfone */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={ouvir}
          disabled={etapa.tipo === "carregando" || (etapa.tipo === "confirmar" && etapa.executando)}
          aria-label={ouvindo ? "Parar de ouvir" : "Falar comando"}
          className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full flex items-center justify-center text-6xl transition-all active:scale-95 disabled:opacity-50 ${
            ouvindo
              ? "bg-orange-500 text-white shadow-[0_0_0_12px_rgba(249,115,22,0.18)] animate-pulse"
              : "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30"
          }`}
        >
          🎤
        </button>
        <p className="text-lg font-semibold text-white text-center">Fale e o CantinaPro faz.</p>
        <p className="text-base text-orange-300 min-h-[1.5rem] text-center break-words max-w-full">
          {ouvindo
            ? (etapa.parcial ? `“${etapa.parcial}”` : "Ouvindo... pode falar")
            : etapa.tipo === "carregando" ? "Conferindo..." : "Toque e fale o comando"}
        </p>
      </div>

      {/* Aviso "Ação realizada" + Desfazer */}
      {feito && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4" role="status">
          <p className="text-base font-semibold text-emerald-300">✓ Ação realizada</p>
          <p className="text-base text-white mt-1 break-words">{frasesFeito(feito.previa)}</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Saldo agora: <span className={`font-semibold tabular-nums ${saldoCls(feito.saldoDepois)}`}>{fmt(feito.saldoDepois)}</span>
          </p>
          {feito.aviso && <p className="text-sm text-amber-300 mt-2">{feito.aviso}</p>}
          {feito.acaoId && (
            <>
              <button
                onClick={() => desfazer(feito.acaoId!)}
                disabled={desfazendo !== null}
                className="mt-3 w-full min-h-[56px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-lg font-semibold transition disabled:opacity-60"
              >
                {desfazendo === feito.acaoId ? "Desfazendo..." : `↩ Desfazer (${restante}s)`}
              </button>
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-1000 ease-linear"
                  style={{ width: `${(restante / DESFAZER_SEGUNDOS) * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {aviso && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            aviso.tipo === "ok"       ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
            aviso.tipo === "conflito" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" :
                                        "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
          role="alert"
        >
          {aviso.texto}
        </div>
      )}

      {/* Não entendi */}
      {etapa.tipo === "erro" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          {etapa.texto && <p className="text-sm text-gray-400 break-words">Ouvi: “{etapa.texto}”</p>}
          <p className="text-base text-red-300 mt-1">{etapa.mensagem}</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => setEtapa({ tipo: "idle" })}
              className="min-h-[52px] rounded-xl border border-cp-border text-gray-300 hover:text-white transition"
            >
              Fechar
            </button>
            <button
              onClick={ouvir}
              className="min-h-[52px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold transition"
            >
              🎤 Falar de novo
            </button>
          </div>
        </div>
      )}

      {/* Mais de um aluno com o nome */}
      {etapa.tipo === "escolher" && (
        <div className="rounded-2xl border border-orange-500/30 bg-cp-elevated p-4">
          <p className="text-sm text-gray-400 break-words">Ouvi: “{etapa.texto}”</p>
          <p className="text-base text-white font-semibold mt-1">Qual aluno?</p>
          <ul className="mt-3 space-y-2">
            {etapa.candidatos.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => carregarPrevia(etapa.texto, a, etapa.intencao, etapa.valor, etapa.forma)}
                  className="w-full min-h-[60px] px-4 py-3 rounded-xl bg-cp-surface border border-cp-border hover:border-orange-500/50 text-left transition"
                >
                  <span className="block text-lg font-semibold text-white break-words">{a.nome}</span>
                  <span className="block text-sm text-gray-500">{a.turma ? `Turma ${a.turma}` : "Sem turma"}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setEtapa({ tipo: "idle" })}
            className="mt-3 w-full min-h-[48px] rounded-xl text-gray-400 hover:text-white transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Consulta de saldo (somente leitura) */}
      {etapa.tipo === "consulta" && (
        <div className="rounded-2xl border border-cp-border bg-cp-elevated p-5 text-center">
          <p className="text-sm text-gray-500 uppercase tracking-wide">Consultar saldo</p>
          <p className="text-3xl font-bold text-white mt-2 break-words">{etapa.previa.nome}</p>
          {etapa.previa.turma && <p className="text-sm text-gray-500">Turma {etapa.previa.turma}</p>}
          {etapa.previa.saldoAntes < 0 ? (
            <>
              <p className="text-base text-gray-400 mt-4">Deve</p>
              <p className="text-5xl font-bold text-red-400 tabular-nums">{fmt(-etapa.previa.saldoAntes)}</p>
            </>
          ) : (
            <>
              <p className="text-base text-gray-400 mt-4">Não deve nada · saldo</p>
              <p className={`text-5xl font-bold tabular-nums ${saldoCls(etapa.previa.saldoAntes)}`}>
                {fmt(etapa.previa.saldoAntes)}
              </p>
            </>
          )}
          <button
            onClick={() => setEtapa({ tipo: "idle" })}
            className="mt-5 w-full min-h-[52px] rounded-xl border border-cp-border text-gray-300 hover:text-white transition"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cartão de confirmação — nada é feito antes do Confirmar */}
      {etapa.tipo === "confirmar" && (
        <div className="rounded-2xl border-2 border-orange-500 bg-cp-elevated p-5" role="dialog" aria-label="Confirmar ação">
          <p className="text-sm font-semibold text-orange-400 uppercase tracking-wide text-center">
            {ROTULO[etapa.previa.intencao]}
          </p>

          <div className="mt-3 rounded-xl bg-black/30 px-4 py-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Aluno</p>
            <p className="text-3xl font-bold text-white break-words leading-tight mt-1">{etapa.previa.nome}</p>
            {etapa.previa.turma && <p className="text-sm text-gray-500 mt-0.5">Turma {etapa.previa.turma}</p>}
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-4">Valor</p>
            <p className="text-5xl font-extrabold text-orange-400 tabular-nums mt-1">{fmt(etapa.previa.valor)}</p>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <div>
              <p className="text-xs text-gray-500">Saldo antes</p>
              <p className={`text-lg font-semibold tabular-nums ${saldoCls(etapa.previa.saldoAntes)}`}>{fmt(etapa.previa.saldoAntes)}</p>
            </div>
            <span className="text-gray-500 text-xl">→</span>
            <div>
              <p className="text-xs text-gray-500">Saldo depois</p>
              <p className={`text-lg font-semibold tabular-nums ${saldoCls(etapa.previa.saldoDepois)}`}>{fmt(etapa.previa.saldoDepois)}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-1.5">Forma de pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setEtapa({ ...etapa, forma: f.id })}
                  disabled={etapa.executando}
                  className={`min-h-[44px] rounded-lg text-sm font-medium border transition ${
                    etapa.forma === f.id
                      ? "bg-orange-500/20 border-orange-500 text-orange-200"
                      : "border-cp-border text-gray-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-4 break-words">Ouvi: “{etapa.texto}”</p>
          {etapa.erro && <p className="text-sm text-red-400 mt-2">{etapa.erro}</p>}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => setEtapa({ tipo: "idle" })}
              disabled={etapa.executando}
              className="min-h-[64px] rounded-xl border border-cp-border text-gray-200 text-lg font-semibold hover:bg-white/5 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={etapa.executando}
              className="min-h-[64px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold shadow-lg shadow-orange-500/25 transition disabled:opacity-60"
            >
              {etapa.executando ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </div>
      )}

      {/* Digitar em vez de falar */}
      {(etapa.tipo === "idle" || etapa.tipo === "erro") && (
        <form
          onSubmit={(e) => { e.preventDefault(); processar(digitado); }}
          className="flex gap-2"
        >
          <input
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder="ou digite: quitar a conta do Breno"
            className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl bg-cp-elevated border border-cp-border text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
          />
          <button
            type="submit"
            disabled={!digitado.trim()}
            className="shrink-0 min-h-[48px] px-4 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-200 font-medium disabled:opacity-40"
          >
            Ok
          </button>
        </form>
      )}

      {/* Últimas ações */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
          Últimas ações do Modo Na Correria
        </h3>
        {erroLista ? (
          <p className="text-sm text-gray-500">{erroLista}</p>
        ) : acoes.length === 0 ? (
          <p className="text-sm text-gray-600">Nenhuma ação ainda.</p>
        ) : (
          <ul className="divide-y divide-cp-border rounded-xl border border-cp-border overflow-hidden">
            {acoes.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 px-3 py-3 ${a.desfeitoEm ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-white break-words">{a.nome}</p>
                  <p className="text-sm text-gray-400">
                    {ROTULO_CURTO[a.tipo]} <span className="font-semibold text-orange-300 tabular-nums">{fmt(a.valor)}</span>
                    <span className="text-gray-600"> · {hora(a.criadoEm)}</span>
                  </p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {fmt(a.saldoAntes)} → {fmt(a.saldoDepois)}
                  </p>
                </div>
                {a.desfeitoEm ? (
                  <span className="shrink-0 text-xs font-medium text-gray-400 border border-cp-border rounded-full px-2.5 py-1">
                    Desfeita
                  </span>
                ) : (
                  <button
                    onClick={() => desfazer(a.id)}
                    disabled={desfazendo !== null}
                    className="shrink-0 min-h-[44px] px-3 rounded-lg border border-cp-border text-sm text-gray-200 hover:border-orange-500/50 hover:text-white transition disabled:opacity-50"
                  >
                    {desfazendo === a.id ? "..." : "↩ Desfazer"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
