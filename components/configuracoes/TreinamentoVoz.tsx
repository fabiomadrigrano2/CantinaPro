"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { interpretarComandoVoz, type ResultadoComando } from "@/lib/vozComando";
import {
  adicionarCorrecaoVoz, listarCorrecoesVoz, removerCorrecaoVoz, type CorrecaoVozRow,
} from "@/app/configuracoes/actions";

type ItemNome = { id: string; nome: string };

const inputCls =
  "w-full px-4 py-2.5 rounded-lg bg-cp-elevated border border-cp-border text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition";

// ── teste por voz ou texto ────────────────────────────────────────────────────

function TestarComando({
  correcoes,
  alunos,
  produtos,
  onCriarCorrecao,
}: {
  correcoes: CorrecaoVozRow[];
  alunos: ItemNome[];
  produtos: ItemNome[];
  onCriarCorrecao: (falado: string) => void;
}) {
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [texto, setTexto] = useState("");
  const [testado, setTestado] = useState<string | null>(null);
  const [erroMic, setErroMic] = useState<string | null>(null);
  const recRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => () => recRef.current?.abort?.(), []);

  // Recalcula quando a lista de correções muda — dá para ver o efeito na hora
  const resultado: ResultadoComando<ItemNome, ItemNome> | null =
    testado ? interpretarComandoVoz(testado, alunos, produtos, correcoes) : null;

  function ouvir() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErroMic("Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge — ou digite a frase abaixo.");
      return;
    }
    if (ouvindo) { recRef.current?.stop(); return; }

    setErroMic(null);
    setParcial("");
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    recRef.current = rec;

    let final = "";
    let silencio: ReturnType<typeof setTimeout> | null = null;

    rec.onstart = () => setOuvindo(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final ? " " : "") + chunk.trim();
        else interim += chunk;
      }
      setParcial((final + " " + interim).trim());
      if (silencio) clearTimeout(silencio);
      silencio = setTimeout(() => rec.stop(), 2500);
    };
    rec.onend = () => {
      if (silencio) clearTimeout(silencio);
      setOuvindo(false);
      setParcial("");
      if (final.trim()) {
        setTexto(final.trim());
        setTestado(final.trim());
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      setOuvindo(false);
      setErroMic(
        e.error === "not-allowed"
          ? "Permissão do microfone negada. Libere o microfone no navegador."
          : "Não foi possível capturar o áudio. Tente novamente."
      );
    };
    rec.start();
  }

  const mudouComCorrecao = resultado && resultado.textoCorrigido !== testado;

  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Testar</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Fale um pedido como na Nova Venda (ex: &ldquo;Ana, dois croassã e um ememe&rdquo;) e veja o que o sistema entende.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={ouvir}
          className={`shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            ouvindo
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
              : "bg-orange-500 hover:bg-orange-600 text-white shadow shadow-orange-500/25"
          }`}
        >
          <span aria-hidden>🎤</span>
          {ouvindo ? "Ouvindo… toque para parar" : "Falar"}
        </button>
        <form
          className="flex-1 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (texto.trim()) setTestado(texto.trim()); }}
        >
          <input
            value={ouvindo ? parcial : texto}
            onChange={(e) => setTexto(e.target.value)}
            readOnly={ouvindo}
            placeholder="…ou digite a frase"
            className={inputCls}
            aria-label="Frase para testar"
          />
          <button
            type="submit"
            disabled={ouvindo || !texto.trim()}
            className="shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium bg-cp-elevated border border-cp-border text-gray-300 hover:border-gray-500 transition disabled:opacity-40"
          >
            Testar
          </button>
        </form>
      </div>

      {erroMic && <p className="text-xs text-red-400">{erroMic}</p>}

      {resultado && (
        <div className="rounded-xl border border-cp-border bg-cp-elevated divide-y divide-cp-border text-sm">
          <Linha rotulo="Ouvido">
            <span className="text-gray-300">&ldquo;{testado}&rdquo;</span>
          </Linha>
          <Linha rotulo="Após correções">
            {mudouComCorrecao ? (
              <span className="text-orange-300">&ldquo;{resultado.textoCorrigido}&rdquo;</span>
            ) : (
              <span className="text-gray-500">nenhuma correção aplicada</span>
            )}
          </Linha>
          <Linha rotulo="Aluno">
            {resultado.aluno ? (
              <span className="text-emerald-400 font-medium">✓ {resultado.aluno.nome}</span>
            ) : (
              <span className="text-red-400">
                ✗ não encontrado{resultado.trechoAluno && <> (&ldquo;{resultado.trechoAluno}&rdquo;)</>}
              </span>
            )}
          </Linha>
          {resultado.aluno && (
            <Linha rotulo="Produtos">
              <div className="space-y-1">
                {resultado.found.map((f, i) => (
                  <p key={i} className="text-emerald-400">✓ {f.qty}x {f.product.nome}</p>
                ))}
                {resultado.notFound.map((nf, i) => (
                  <div key={`nf-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-red-400">✗ &ldquo;{nf}&rdquo; não reconhecido</span>
                    <button
                      type="button"
                      onClick={() => onCriarCorrecao(nf)}
                      className="text-xs font-semibold text-orange-400 hover:text-orange-300 underline underline-offset-2"
                    >
                      Criar correção
                    </button>
                  </div>
                ))}
                {resultado.found.length === 0 && resultado.notFound.length === 0 && (
                  <p className="text-gray-500">nenhum produto falado</p>
                )}
              </div>
            </Linha>
          )}
          {!resultado.aluno && resultado.trechoAluno && (
            <div className="px-4 py-2.5">
              <button
                type="button"
                onClick={() => onCriarCorrecao(resultado.trechoAluno!)}
                className="text-xs font-semibold text-orange-400 hover:text-orange-300 underline underline-offset-2"
              >
                Criar correção para &ldquo;{resultado.trechoAluno}&rdquo;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-2.5">
      <span className="sm:w-32 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide sm:pt-0.5">
        {rotulo}
      </span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

// ── tela ──────────────────────────────────────────────────────────────────────

export default function TreinamentoVoz({
  correcoesIniciais,
  alunos,
  produtos,
}: {
  correcoesIniciais: CorrecaoVozRow[];
  alunos: ItemNome[];
  produtos: ItemNome[];
}) {
  const [correcoes, setCorrecoes] = useState(correcoesIniciais);
  const [falado, setFalado] = useState("");
  const [corrigido, setCorrigido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const faladoRef = useRef<HTMLInputElement>(null);

  async function recarregar() {
    setCorrecoes(await listarCorrecoesVoz());
  }

  function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const result = await adicionarCorrecaoVoz(falado, corrigido);
      if (result.error) { setErro(result.error); return; }
      setFalado("");
      setCorrigido("");
      await recarregar();
    });
  }

  function handleRemover(id: string) {
    setRemovendo(id);
    startTransition(async () => {
      const result = await removerCorrecaoVoz(id);
      if (result.error) setErro(result.error);
      else setCorrecoes((prev) => prev.filter((c) => c.id !== id));
      setRemovendo(null);
    });
  }

  function criarCorrecaoPara(texto: string) {
    setFalado(texto);
    setCorrigido("");
    setErro(null);
    faladoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => document.getElementById("voz-corrigido")?.focus(), 300);
  }

  // Sugestões para o campo "entender": nomes reais de produtos e alunos
  const sugestoes = Array.from(new Set([...produtos, ...alunos].map((x) => x.nome)));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">🎤 Treinamento de Voz</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ensine o comando de voz da Nova Venda a entender palavras que o reconhecimento costuma errar.
          As correções valem para produtos e nomes de alunos, sem diferenciar maiúsculas nem acentos.
        </p>
      </div>

      <TestarComando
        correcoes={correcoes}
        alunos={alunos}
        produtos={produtos}
        onCriarCorrecao={criarCorrecaoPara}
      />

      {/* Adicionar */}
      <form
        onSubmit={handleAdicionar}
        className="bg-cp-surface border border-cp-border rounded-2xl p-5 space-y-4"
      >
        <p className="text-sm font-semibold text-white">Nova correção</p>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-center gap-2 sm:gap-3">
          <label htmlFor="voz-falado" className="text-sm text-gray-400">Quando eu falar</label>
          <input
            id="voz-falado"
            ref={faladoRef}
            value={falado}
            onChange={(e) => setFalado(e.target.value)}
            placeholder="ex: croassã"
            className={inputCls}
            autoComplete="off"
          />
          <label htmlFor="voz-corrigido" className="text-sm text-gray-400">entender</label>
          <input
            id="voz-corrigido"
            value={corrigido}
            onChange={(e) => setCorrigido(e.target.value)}
            placeholder="ex: Croissant"
            list="voz-sugestoes"
            className={inputCls}
            autoComplete="off"
          />
          <datalist id="voz-sugestoes">
            {sugestoes.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !falado.trim() || !corrigido.trim()}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition shadow shadow-orange-500/25 disabled:opacity-40 disabled:shadow-none"
          >
            Adicionar correção
          </button>
        </div>
      </form>

      {/* Lista */}
      <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-cp-border">
          <p className="text-sm font-semibold text-white">Correções cadastradas</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-orange-400 bg-orange-400/10 border-orange-400/20">
            {correcoes.length}
          </span>
        </div>
        {correcoes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-600">Nenhuma correção cadastrada.</p>
        ) : (
          <ul className="divide-y divide-cp-border">
            {correcoes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="text-gray-400">&ldquo;{c.falado}&rdquo;</span>
                  <span className="text-gray-600" aria-label="vira">→</span>
                  <span className="text-white font-medium">{c.corrigido}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemover(c.id)}
                  disabled={removendo === c.id}
                  title="Remover correção"
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                >
                  {removendo === c.id ? "Removendo…" : "Remover"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
