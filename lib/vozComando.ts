// Interpretação do comando de voz da Nova Venda ("Ana, dois croissant e uma
// coca"). Compartilhado com a tela de Treinamento de Voz, que usa a mesma
// lógica para o botão "Testar".

type ComNome = { nome: string };

// ── Voice helpers ──────────────────────────────────────────────────────────────

export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

const PT_NUMBERS: Record<string, number> = {
  um: 1, uma: 1, hum: 1, huma: 1,
  dois: 2, duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14, quatorze: 14,
  quinze: 15,
  dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17,
  dezoito: 18,
  dezenove: 19, dezanove: 19,
  vinte: 20,
};

function parseQtyWord(word: string): number | null {
  const n = parseInt(word, 10);
  if (!isNaN(n) && n > 0) return n;
  return PT_NUMBERS[normalizeStr(word)] ?? null;
}

// Chave fonética: remove espaços e aplica substituições comuns do speech recognition PT-BR
// para nomes de produtos em inglês. Aplicada tanto na query quanto no nome do produto,
// então a normalização não precisa ser "correta" — só consistente.
function phoneticKey(s: string): string {
  return normalizeStr(s)
    .replace(/\s+/g, "")
    .replace(/qui/g, "ki")
    .replace(/que/g, "ke")
    .replace(/ca/g, "ka")
    .replace(/co/g, "ko")
    .replace(/cu/g, "ku")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/tt/g, "t")
    .replace(/ss/g, "s")
    .replace(/ll/g, "l")
    .replace(/ch/g, "x")
    .replace(/sh/g, "x")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

// Dicionário de correções para padrões que o speech recognition costuma errar.
// Aplicado antes do fuzzy match — cobre variações fonéticas conhecidas de marcas em inglês.
const SPEECH_CORRECTIONS: [RegExp, string][] = [
  // KitKat
  [/\bqui\s*c[ae]t[ae]?s?\b/gi, "KitKat"],
  [/\bki\s*k[ae]ts?\b/gi, "KitKat"],
  [/\bkit\s*c[ae]ts?\b/gi, "KitKat"],
  [/\bquit\s*c[ae]ts?\b/gi, "KitKat"],
  // Coca-Cola
  [/\bc[o0]ca?\s*c[o0]la?\b/gi, "Coca-Cola"],
  [/\bk[o0]ka?\s*k[o0]la?\b/gi, "Coca-Cola"],
  // Pepsi
  [/\bpep[cs][ei]\b/gi, "Pepsi"],
  // Cheetos
  [/\b[cs]h?[ei]t[ou]s\b/gi, "Cheetos"],
  // Doritos
  [/\bd[ou]rit[ou]s?\b/gi, "Doritos"],
  // Ruffles
  [/\br[ua]f[eu]l[sz]?\b/gi, "Ruffles"],
  // Fandangos
  [/\bfand[aâ]ng[ou]s?\b/gi, "Fandangos"],
  // Oreo
  [/\b[o0]r[ei][o0]s?\b/gi, "Oreo"],
  // Bis
  [/\bbiz\b/gi, "Bis"],
  // Twix
  [/\bt[uw][iy][sx]?\b/gi, "Twix"],
  [/\btu[iy]x\b/gi, "Twix"],
  // KitKat (transcrição direta)
  [/\bkit\s*kat\b/gi, "KitKat"],
  // Snickers (erro fonético comum: sneakers, snickers)
  [/\bsn[ei][ae]k[ae]rs?\b/gi, "Snickers"],
  // Toddy
  [/\bt[o0]d[iy]\b/gi, "Toddy"],
  // Nescau
  [/\bnesc[ao][uo]\b/gi, "Nescau"],
  // Nutella
  [/\bnut[ei]la\b/gi, "Nutella"],
  // Pringles
  [/\bpring[ue]l[sz]?\b/gi, "Pringles"],
  // Lays / Lay's
  [/\bl[ae][iy]s?\b/gi, "Lays"],
  // Toddynho
  [/\bt[o0]din[hy][o0]\b/gi, "Toddynho"],
];

function applyCorrections(text: string): string {
  let result = text;
  for (const [pattern, correction] of SPEECH_CORRECTIONS) {
    result = result.replace(pattern, correction);
  }
  return result;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function scoreMatch(query: string, target: string): number {
  const q = normalizeStr(query);
  const t = normalizeStr(target);
  if (t === q) return 100;
  if (t.startsWith(q) || q.startsWith(t)) return 85;
  if (t.includes(q)) return 75;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const matched = words.filter((w) => t.includes(w)).length;
  return Math.round((matched / words.length) * 60);
}

export function fuzzyMatchAluno<T extends ComNome>(query: string, list: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const a of list) {
    const s = scoreMatch(query, a.nome);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return bestScore >= 40 ? best : null;
}

// Gera variantes normalizadas da query: singular, base de diminutivo, etc.
// Permite que "fofuras", "fofurinha" ou "fofurinhas" encontrem "Fofura".
function queryVariants(qNorm: string): string[] {
  const vars = new Set<string>([qNorm]);

  // Remove plural simples: fofuras → fofura
  if (qNorm.endsWith("s") && qNorm.length > 3) {
    vars.add(qNorm.slice(0, -1));
  }

  // Remove sufixos diminutivos (maior primeiro para não remover parcialmente)
  const dimSuffixes = [
    "zinhas", "zinhos", "inhas", "inhos",
    "zinha",  "zinho",  "inha",  "inho",
  ];
  for (const suf of dimSuffixes) {
    if (qNorm.endsWith(suf) && qNorm.length > suf.length + 2) {
      const base = qNorm.slice(0, -suf.length);
      vars.add(base);
      vars.add(base + "a");  // cafezinho → cafe + a = cafea... mas fofurinha → fofura ✓
      vars.add(base + "o");
      // também tenta sem plural se o base terminar em 's'
      if (base.endsWith("s") && base.length > 3) vars.add(base.slice(0, -1));
      break;
    }
  }

  return Array.from(vars).filter((v) => v.length >= 2);
}

function scoreMatchNorm(qNorm: string, tNorm: string): number {
  if (tNorm === qNorm) return 100;
  if (tNorm.startsWith(qNorm) || qNorm.startsWith(tNorm)) return 85;
  if (tNorm.includes(qNorm)) return 75;
  const words = qNorm.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const matched = words.filter((w) => tNorm.includes(w)).length;
  return Math.round((matched / words.length) * 60);
}

export function fuzzyMatchProduto<T extends ComNome>(query: string, list: T[]): T | null {
  const corrected = applyCorrections(query);
  const qNorm = normalizeStr(corrected);
  const variants = queryVariants(qNorm);

  let best: T | null = null;
  let bestScore = 0;

  for (const p of list) {
    const pNorm = normalizeStr(p.nome);
    let s = 0;

    // Layer 1: textual em todas as variantes (plural→singular, diminutivo→base)
    for (const v of variants) {
      s = Math.max(s, scoreMatchNorm(v, pNorm));
    }

    // Layer 2: fonético em todas as variantes
    const pKey = phoneticKey(p.nome);
    for (const v of variants) {
      if (v.length < 3) continue;
      const vKey = phoneticKey(v);
      if (vKey === pKey) {
        s = Math.max(s, 95);
      } else if (pKey.includes(vKey) || vKey.includes(pKey)) {
        s = Math.max(s, 80);
      } else if (pKey.length >= 3) {
        const dist = levenshtein(vKey, pKey);
        const sim = 1 - dist / Math.max(vKey.length, pKey.length);
        if (sim >= 0.7) s = Math.max(s, Math.round(sim * 85));
      }
    }

    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= 35 ? best : null;
}

export type ParsedItem<T> = { product: T; qty: number };

export function parseProductsText<T extends ComNome>(
  text: string,
  list: T[]
): { found: ParsedItem<T>[]; notFound: string[] } {
  const found: ParsedItem<T>[] = [];
  const notFound: string[] = [];

  // Divide por conjunções explícitas ("e", "mais")
  const conjParts = text.split(/\s+(?:e|mais)\s+/i);

  for (const conjPart of conjParts) {
    const raw = conjPart.trim();
    if (!raw) continue;

    const tokens = raw.split(/\s+/);

    // Dentro de cada segmento, palavras de quantidade após um nome
    // delimitam um novo item — cobre "um X uma Y um Z" sem "e" entre eles.
    const groups: string[][] = [];
    let current: string[] = [];
    let hasNonQty = false;

    for (const token of tokens) {
      const isQty = parseQtyWord(token) !== null;
      if (isQty && hasNonQty) {
        groups.push(current);
        current = [token];
        hasNonQty = false;
      } else {
        current.push(token);
        if (!isQty) hasNonQty = true;
      }
    }
    if (current.length > 0) groups.push(current);

    for (const group of groups) {
      let qty = 1;
      let nameStart = 0;
      let nameEnd = group.length;

      const qFirst = parseQtyWord(group[0]);
      if (qFirst !== null) {
        qty = qFirst;
        nameStart = 1;
      } else if (group.length > 1) {
        const qLast = parseQtyWord(group[group.length - 1]);
        if (qLast !== null) {
          qty = qLast;
          nameEnd = group.length - 1;
        }
      }

      const name = group.slice(nameStart, nameEnd).join(" ");
      if (!name.trim()) continue;

      const product = fuzzyMatchProduto(name, list);
      if (product) found.push({ product, qty });
      else notFound.push(group.join(" "));
    }
  }

  return { found, notFound };
}

// Divide "Nome do Aluno, produto e produto" ou tenta sem vírgula
export function splitCommand<T extends ComNome>(
  transcript: string,
  alunos: T[]
): { studentPart: string; productsPart: string } | null {
  const commaIdx = transcript.indexOf(",");
  if (commaIdx > 0) {
    return {
      studentPart: transcript.slice(0, commaIdx).trim(),
      productsPart: transcript.slice(commaIdx + 1).trim(),
    };
  }
  // Sem vírgula — tenta prefixos progressivos
  const words = transcript.trim().split(/\s+/);
  let best: { score: number; split: number } | null = null;
  for (let i = 1; i <= Math.min(words.length - 1, 5); i++) {
    const prefix = words.slice(0, i).join(" ");
    const aluno = fuzzyMatchAluno(prefix, alunos);
    if (aluno) {
      const s = scoreMatch(prefix, aluno.nome);
      if (!best || s > best.score) best = { score: s, split: i };
    }
  }
  if (!best) return null;
  return {
    studentPart: words.slice(0, best.split).join(" "),
    productsPart: words.slice(best.split).join(" "),
  };
}


// ── Correções cadastradas (Treinamento de Voz) ────────────────────────────────

export type CorrecaoVoz = { falado: string; corrigido: string };

// Minúsculas e sem acento, caractere a caractere — mantém os índices alinhados
// com o texto original para que as trocas preservem o resto da frase.
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Troca cada expressão falada pela correção, sem diferenciar maiúsculas nem
// acentos, só em palavras inteiras ("m m" não afeta "mmm"). Expressões mais
// longas primeiro, para "esfiha quatro queijos" vencer um eventual "quatro".
export function aplicarCorrecoesVoz(texto: string, correcoes: CorrecaoVoz[]): string {
  const ordenadas = correcoes
    .map((c) => ({ falado: semAcento(c.falado.trim()).replace(/\s+/g, " "), corrigido: c.corrigido.trim() }))
    .filter((c) => c.falado && c.corrigido)
    .sort((a, b) => b.falado.length - a.falado.length);

  let resultado = texto;
  for (const { falado, corrigido } of ordenadas) {
    const chars = Array.from(resultado);
    const norm = chars.map(semAcento);
    // Se algum caractere não vira exatamente um, os índices desalinham —
    // nesse caso (raro) aplica sobre o texto normalizado.
    const alinhado = norm.every((c) => c.length === 1);
    const base = alinhado ? norm.join("") : semAcento(resultado);
    const origem = alinhado ? chars : Array.from(base);

    // Grupo 1 = separador antes da palavra (sem lookbehind: Safari < 16.4 não suporta)
    const padrao = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${escapeRegex(falado).replace(/ /g, "\\s+")})(?=$|[^\\p{L}\\p{N}])`,
      "gu"
    );
    const partes: string[] = [];
    let ultimo = 0;
    for (const m of Array.from(base.matchAll(padrao))) {
      const ini = m.index! + m[1].length;
      partes.push(origem.slice(ultimo, ini).join(""), corrigido);
      ultimo = ini + m[2].length;
    }
    if (partes.length === 0) continue;
    partes.push(origem.slice(ultimo).join(""));
    resultado = partes.join("");
  }
  return resultado;
}

// ── Interpretação completa do comando ─────────────────────────────────────────

export type ResultadoComando<A, P> = {
  textoCorrigido: string;
  aluno: A | null;
  trechoAluno: string | null;
  found: ParsedItem<P>[];
  notFound: string[];
  erro: string | null;
};

export function interpretarComandoVoz<A extends ComNome, P extends ComNome>(
  transcript: string,
  alunos: A[],
  produtos: P[],
  correcoes: CorrecaoVoz[],
): ResultadoComando<A, P> {
  const textoCorrigido = aplicarCorrecoesVoz(transcript, correcoes);
  const vazio = { textoCorrigido, aluno: null, trechoAluno: null, found: [], notFound: [] };

  const split = splitCommand(textoCorrigido, alunos);
  if (!split) return { ...vazio, erro: `Aluno não identificado em: "${textoCorrigido}"` };

  const aluno = fuzzyMatchAluno(split.studentPart, alunos);
  if (!aluno) {
    return { ...vazio, trechoAluno: split.studentPart, erro: `Aluno não encontrado: "${split.studentPart}"` };
  }

  const { found, notFound } = parseProductsText(split.productsPart, produtos);
  return {
    textoCorrigido,
    aluno,
    trechoAluno: split.studentPart,
    found,
    notFound,
    erro: found.length === 0 ? `Nenhum produto reconhecido. Tente: "um X-Burguer e uma Coca Cola"` : null,
  };
}
