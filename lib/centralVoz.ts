// Interpretação dos comandos do Modo Na Correria do Dashboard:
//   "Abater 150 reais da conta da Marcela"
//   "Adicionar 100 reais de crédito ao Henrique"
//   "Quitar a conta do Breno"
//   "Quanto o Breno deve?"
// Nunca adivinha: se o aluno ou o valor não ficarem claros, devolve erro
// pedindo para repetir; se o nome bater com mais de um aluno, devolve as opções.

import { aplicarCorrecoesVoz, normalizeStr, type CorrecaoVoz } from "@/lib/vozComando";

export type TipoAcaoVoz = "abater" | "credito" | "quitar";
export type IntencaoVoz = TipoAcaoVoz | "consulta";
export type FormaPagamento = "dinheiro" | "pix" | "cartao";

type ComNome = { id: string; nome: string };

// ── valores falados ───────────────────────────────────────────────────────────

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

function valorPalavra(t: string): number | null {
  return UNIDADES[t] ?? DEZENAS[t] ?? CENTENAS[t] ?? null;
}

// "150", "150,50", "1.200", "1.200,00", "150.5"
function valorDigitos(t: string): number | null {
  if (!/^\d[\d.,]*$/.test(t)) return null;
  let s = t;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const MOEDA = new Set(["reais", "real", "conto", "contos", "pila", "pilas"]);
const CENTAVOS = new Set(["centavos", "centavo"]);

// Lê uma sequência numérica a partir de tokens[i]: palavras por extenso unidas
// por "e" ("cento e cinquenta", "mil e duzentos") ou um número em dígitos
// (com "mil" opcional depois: "2 mil"). Retorna null se tokens[i] não é número.
function lerNumero(tokens: string[], i: number): { valor: number; fim: number } | null {
  const dig = valorDigitos(tokens[i]);
  if (dig !== null) {
    if (tokens[i + 1] === "mil") return { valor: dig * 1000, fim: i + 2 };
    return { valor: dig, fim: i + 1 };
  }

  let total = 0;
  let atual = 0;
  let lido = false;
  let j = i;
  while (j < tokens.length) {
    const t = tokens[j];
    const v = valorPalavra(t);
    if (v !== null) {
      atual += v;
      lido = true;
      j++;
    } else if (t === "mil") {
      total += (atual || 1) * 1000;
      atual = 0;
      lido = true;
      j++;
    } else if (t === "e" && lido && j + 1 < tokens.length &&
               (valorPalavra(tokens[j + 1]) !== null || tokens[j + 1] === "mil")) {
      j++;
    } else {
      break;
    }
  }
  return lido ? { valor: total + atual, fim: j } : null;
}

// Primeiro valor em reais do texto (tokens já normalizados). Aceita centavos
// ("cinquenta reais e vinte centavos"). Retorna também os índices consumidos,
// para que não sejam confundidos com o nome do aluno.
export function extrairValor(tokens: string[]): { valor: number; usados: Set<number> } | null {
  for (let i = 0; i < tokens.length; i++) {
    const n = lerNumero(tokens, i);
    if (!n) continue;
    // "uma recarga de 50 reais": "um"/"uma" soltos são artigo, não valor
    if (n.fim === i + 1 && (tokens[i] === "um" || tokens[i] === "uma") && !MOEDA.has(tokens[i + 1])) {
      continue;
    }

    const usados = new Set<number>();
    for (let k = i; k < n.fim; k++) usados.add(k);
    if (i > 0 && (tokens[i - 1] === "r" || tokens[i - 1] === "rs")) usados.add(i - 1);

    let valor = n.valor;
    let j = n.fim;
    if (MOEDA.has(tokens[j])) usados.add(j++);

    // "... e vinte centavos" / "... com vinte centavos"
    if (tokens[j] === "e" || tokens[j] === "com") {
      const c = lerNumero(tokens, j + 1);
      if (c && CENTAVOS.has(tokens[c.fim]) && c.valor < 100) {
        valor += c.valor / 100;
        for (let k = j; k <= c.fim; k++) usados.add(k);
      }
    } else if (CENTAVOS.has(tokens[j]) && n.valor < 100) {
      // Só centavos: "cinquenta centavos"
      valor = n.valor / 100;
      usados.add(j);
    }

    return { valor: Math.round(valor * 100) / 100, usados };
  }
  return null;
}

// "cento e cinquenta" → 150, "R$ 150,50" → 150.5
export function parseValorFalado(texto: string): number | null {
  return extrairValor(tokenizar(texto))?.valor ?? null;
}

// ── intenção ──────────────────────────────────────────────────────────────────

const PALAVRAS_QUITAR   = ["quitar", "quita", "quite", "quitacao", "zerar", "zera", "zere"];
const PALAVRAS_CREDITO  = ["credito", "creditos", "recarga", "recarregar", "recarrega", "recarregue"];
const PALAVRAS_ADICIONAR = ["adicionar", "adiciona", "adicione", "colocar", "coloca", "coloque", "bota", "botar", "bote", "depositar", "deposita"];
const PALAVRAS_ABATER   = [
  "abater", "abate", "abata", "abatimento", "descontar", "desconta", "desconte",
  "pagou", "pagamento", "pagar", "paga", "pague", "recebi", "receber", "recebe",
  "baixa", "baixar", "debitar", "tirar", "tira",
];
const PALAVRAS_CONSULTA = ["quanto", "qual", "deve", "devendo", "divida", "saldo", "consulta", "consultar"];

const FORMAS: Record<string, FormaPagamento> = {
  pix: "pix", piks: "pix", pics: "pix",
  dinheiro: "dinheiro", especie: "dinheiro",
  cartao: "cartao", debito: "cartao",
};

// Palavras que nunca fazem parte do nome do aluno
const IGNORAR = new Set([
  ...PALAVRAS_QUITAR, ...PALAVRAS_CREDITO, ...PALAVRAS_ADICIONAR, ...PALAVRAS_ABATER,
  ...PALAVRAS_CONSULTA, ...Object.keys(FORMAS), ...Array.from(MOEDA), ...Array.from(CENTAVOS),
  "r", "rs", "de", "da", "do", "das", "dos", "a", "o", "as", "os", "ao", "aos", "na", "no",
  "nas", "nos", "em", "pra", "pro", "para", "pela", "pelo", "por", "com", "e", "que", "conta",
  "valor", "total", "toda", "todo", "tudo", "inteira", "inteiro", "aluno", "aluna", "esta",
  "ta", "tem", "ainda", "favor", "agora", "hoje", "me", "fala", "diz", "ver", "via", "cartao",
  "isso", "ai", "la", "aqui", "dela", "dele", "fazer", "faz", "registrar", "registra",
]);

function tokenizar(texto: string): string[] {
  // normalizeStr remove vírgula/ponto; aqui preservamos os de números (150,50)
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/r\$\s*/g, "r ")
    .replace(/(\d),(?=\d)/g, "$1§")
    .replace(/(\d)\.(?=\d)/g, "$1¤")
    .replace(/[^a-z0-9§¤\s]/g, " ")
    .replace(/§/g, ",")
    .replace(/¤/g, ".")
    .split(/\s+/)
    .filter(Boolean);
}

function detectarIntencao(tokens: string[], temValor: boolean): IntencaoVoz | null {
  const tem = (lista: string[]) => tokens.some((t) => lista.includes(t));
  if (tem(PALAVRAS_QUITAR)) return "quitar";
  // "Quanto o Breno deve?", "Qual o saldo de crédito do Henrique?" — pergunta
  // sem valor é consulta, mesmo citando "crédito" ou "pagou"
  if (!temValor && tem(PALAVRAS_CONSULTA)) return "consulta";
  if (tem(PALAVRAS_CREDITO)) return "credito";
  if (tem(PALAVRAS_ABATER)) return "abater";
  // "Adicionar 100 reais ao Henrique" sem dizer "crédito"
  if (tem(PALAVRAS_ADICIONAR)) return "credito";
  return null;
}

// ── nome do aluno ─────────────────────────────────────────────────────────────

function distancia(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Quanto uma palavra falada se parece com uma palavra do nome (0 a 1)
function notaPalavra(q: string, n: string): number {
  if (q === n) return 1;
  if (q.length >= 3 && n.startsWith(q)) return 0.85;
  const d = distancia(q, n);
  if (d === 1 && Math.min(q.length, n.length) >= 4) return 0.75;
  if (d === 2 && Math.min(q.length, n.length) >= 7) return 0.65;
  return 0;
}

const CONECTORES_NOME = new Set(["de", "da", "do", "das", "dos", "e"]);

// Nota de 0 a 100 do aluno para o trecho falado. Todas as palavras faladas
// precisam bater com alguma palavra do nome — senão a nota é 0.
function notaAluno(palavras: string[], nome: string): number {
  const nomeNorm = normalizeStr(nome);
  if (nomeNorm === palavras.join(" ")) return 100;
  const doNome = nomeNorm.split(/\s+/).filter((w) => !CONECTORES_NOME.has(w));
  if (palavras.length === 0 || doNome.length === 0) return 0;

  let soma = 0;
  for (const p of palavras) {
    const melhor = Math.max(...doNome.map((n) => notaPalavra(p, n)));
    if (melhor === 0) return 0;
    soma += melhor;
  }
  let nota = (soma / palavras.length) * 90;
  if (palavras[0] === doNome[0]) nota += 5;           // primeiro nome exato
  if (palavras.length === doNome.length) nota += 3;   // nome completo dito
  return Math.min(99, Math.round(nota));
}

// Alunos compatíveis com o trecho falado, do mais provável ao menos. Mais de
// um na lista = ambíguo (o usuário escolhe).
export function buscarCandidatosAluno<T extends ComNome>(palavras: string[], alunos: T[]): T[] {
  const notas = alunos
    .map((a) => ({ a, nota: notaAluno(palavras, a.nome) }))
    .filter((x) => x.nota >= 60)
    .sort((x, y) => y.nota - x.nota);
  if (notas.length === 0) return [];
  const topo = notas[0].nota;
  if (topo === 100) return notas.filter((x) => x.nota === 100).map((x) => x.a);
  return notas.filter((x) => x.nota >= topo - 10).slice(0, 6).map((x) => x.a);
}

// ── comando completo ──────────────────────────────────────────────────────────

export type ComandoVoz<T> =
  | { ok: false; textoCorrigido: string; erro: string }
  | {
      ok: true;
      textoCorrigido: string;
      intencao: IntencaoVoz;
      valor: number | null;
      formaPagamento: FormaPagamento | null;
      candidatos: T[]; // 1 = identificado; >1 = escolher
    };

export function interpretarComandoCentral<T extends ComNome>(
  transcript: string,
  alunos: T[],
  correcoes: CorrecaoVoz[],
): ComandoVoz<T> {
  const textoCorrigido = aplicarCorrecoesVoz(transcript.trim(), correcoes);
  const tokens = tokenizar(textoCorrigido);
  const falha = (erro: string) => ({ ok: false as const, textoCorrigido, erro });

  if (tokens.length === 0) return falha("Não ouvi nada. Toque no microfone e fale de novo.");

  const valorLido = extrairValor(tokens);
  const usados = valorLido?.usados ?? new Set<number>();

  const intencao = detectarIntencao(tokens, valorLido !== null);
  if (!intencao) {
    return falha('Não entendi o que fazer. Diga, por exemplo: "Abater 150 reais da conta da Marcela".');
  }

  const precisaValor = intencao === "abater" || intencao === "credito";
  if (precisaValor && (!valorLido || valorLido.valor <= 0)) {
    return falha(
      intencao === "credito"
        ? 'Não entendi o valor. Repita, ex: "Adicionar 100 reais de crédito ao Henrique".'
        : 'Não entendi o valor. Repita, ex: "Abater 150 reais da conta da Marcela".'
    );
  }

  const formaPagamento = tokens.map((t) => FORMAS[t]).find(Boolean) ?? null;

  const palavrasNome = tokens.filter(
    (t, i) => !usados.has(i) && !IGNORAR.has(t) && valorPalavra(t) === null && valorDigitos(t) === null
  );
  if (palavrasNome.length === 0) return falha("Não entendi o nome do aluno. Fale de novo, dizendo o nome.");

  const candidatos = buscarCandidatosAluno(palavrasNome, alunos);
  if (candidatos.length === 0) {
    return falha(`Não encontrei nenhum aluno chamado "${palavrasNome.join(" ")}". Fale de novo.`);
  }

  return {
    ok: true,
    textoCorrigido,
    intencao,
    valor: precisaValor ? valorLido!.valor : null,
    formaPagamento,
    candidatos,
  };
}
