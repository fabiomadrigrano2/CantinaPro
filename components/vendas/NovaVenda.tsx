"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

type Aluno = {
  id: string;
  nome: string;
  turma: string;
  saldo: number;
  limite_diario: number;
  tipo: string;
};

type Produto = {
  id: string;
  emoji: string;
  nome: string;
  preco: number;
  estoque: number;
  categoria: string | null;
  foto_url: string | null;
};

// ── Voice helpers ──────────────────────────────────────────────────────────────

function normalizeStr(s: string): string {
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

function scoreMatch(query: string, target: string): number {
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

function fuzzyMatchAluno(query: string, list: Aluno[]): Aluno | null {
  let best: Aluno | null = null;
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

function fuzzyMatchProduto(query: string, list: Produto[]): Produto | null {
  const corrected = applyCorrections(query);
  const qNorm = normalizeStr(corrected);
  const variants = queryVariants(qNorm);

  let best: Produto | null = null;
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

type ParsedItem = { product: Produto; qty: number };

function parseProductsText(
  text: string,
  list: Produto[]
): { found: ParsedItem[]; notFound: string[] } {
  const found: ParsedItem[] = [];
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
function splitCommand(
  transcript: string,
  alunos: Aluno[]
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

// ── Constants & helpers ────────────────────────────────────────────────────────

const TABS = [
  { value: "todos",       label: "Todos"       },
  { value: "salgados",    label: "Salgados"    },
  { value: "bebidas",     label: "Bebidas"     },
  { value: "doces",       label: "Doces"       },
  { value: "salgadinhos", label: "Salgadinhos" },
] as const;

type TabValue = typeof TABS[number]["value"];

type Phase = "search" | "products" | "voice-confirm" | "success";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function balanceColor(v: number) {
  if (v <= 0) return "text-red-400";
  if (v < 10) return "text-amber-400";
  return "text-emerald-400";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NovaVenda() {
  const [phase, setPhase] = useState<Phase>("search");
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<TabValue>("todos");
  const [confirming, setConfirming] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [successName, setSuccessName] = useState("");

  // Voice
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar dados ─────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [
        { data: alunosData },
        { data: produtosData },
        { data: popularityData },
      ] = await Promise.all([
        supabase
          .from("alunos")
          .select("id, nome, turma, limite_diario, tipo_conta, saldo")
          .eq("cantina_id", CANTINA_ID)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("produtos")
          .select("id, emoji, nome, preco, estoque, categoria, foto_url")
          .eq("cantina_id", CANTINA_ID)
          .eq("disponivel", true)
          .order("nome"),
        supabase
          .from("pedidos")
          .select("itens_pedido(produto_id, quantidade)")
          .eq("cantina_id", CANTINA_ID)
          .limit(500),
      ]);

      setAlunos(
        (alunosData ?? []).map((a: any) => ({
          id: a.id,
          nome: a.nome,
          turma: a.turma ?? "—",
          limite_diario: a.limite_diario ?? 0,
          saldo: a.saldo ?? 0,
          tipo: a.tipo_conta ?? "credito",
        }))
      );

      const rankMap: Record<string, number> = {};
      for (const pedido of (popularityData ?? []) as any[]) {
        for (const item of pedido.itens_pedido ?? []) {
          rankMap[item.produto_id] =
            (rankMap[item.produto_id] ?? 0) + (item.quantidade ?? 0);
        }
      }
      const sorted = (produtosData ?? [])
        .slice()
        .sort((a: any, b: any) => (rankMap[b.id] ?? 0) - (rankMap[a.id] ?? 0));

      setProdutos(sorted as Produto[]);
      setLoadingData(false);
    }

    load();
  }, []);

  // ── Auto-focus no campo de busca ───────────────────────────────────────────

  useEffect(() => {
    if (phase === "search") {
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return alunos
      .filter(
        (a) =>
          a.nome.toLowerCase().includes(q) ||
          a.turma.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [alunos, search]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => ({
          product: produtos.find((p) => p.id === id)!,
          qty,
        }))
        .filter(({ product }) => product != null),
    [cart, produtos]
  );

  const total = useMemo(
    () => cartItems.reduce((s, { product, qty }) => s + product.preco * qty, 0),
    [cartItems]
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { todos: produtos.length };
    for (const p of produtos) {
      const cat = p.categoria ?? "outros";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    if (categoriaSelecionada === "todos") return produtos;
    return produtos.filter(
      (p) => (p.categoria ?? "outros") === categoriaSelecionada
    );
  }, [produtos, categoriaSelecionada]);

  const isFiado = selectedAluno?.tipo === "fiado";
  const saldoApos = selectedAluno ? selectedAluno.saldo - total : null;
  const canConfirm =
    !!selectedAluno &&
    cartItems.length > 0 &&
    (isFiado || (saldoApos ?? -1) >= 0);

  const totalItens = cartItems.reduce((s, { qty }) => s + qty, 0);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function selectAluno(a: Aluno) {
    setSelectedAluno(a);
    setSearch("");
    setCart({});
    setSaleError(null);
    setVoiceWarning(null);
    setVoiceError(null);
    setPhase("products");
  }

  function backToSearch() {
    setPhase("search");
    setSelectedAluno(null);
    setCart({});
    setSaleError(null);
    setVoiceWarning(null);
    setVoiceError(null);
  }

  function addProduct(id: string) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  function removeProduct(id: string) {
    setCart((prev) => {
      const next = (prev[id] ?? 0) - 1;
      if (next <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  // ── Voz ───────────────────────────────────────────────────────────────────

  function processVoiceCommand(transcript: string) {
    console.log("[voz] transcript completo:", JSON.stringify(transcript));
    setVoiceError(null);

    const split = splitCommand(transcript, alunos);
    if (!split) {
      setVoiceError(`Aluno não identificado em: "${transcript}"`);
      return;
    }

    const aluno = fuzzyMatchAluno(split.studentPart, alunos);
    if (!aluno) {
      setVoiceError(`Aluno não encontrado: "${split.studentPart}"`);
      return;
    }

    const { found, notFound } = parseProductsText(split.productsPart, produtos);

    const newCart: Record<string, number> = {};
    for (const { product, qty } of found) {
      newCart[product.id] = (newCart[product.id] ?? 0) + qty;
    }

    if (found.length === 0) {
      setVoiceError(`Nenhum produto reconhecido. Tente: "um X-Burguer e uma Coca Cola"`);
      return;
    }

    setVoiceWarning(
      notFound.length > 0
        ? `Não reconhecido: ${notFound.map((x) => `"${x}"`).join(", ")}`
        : null
    );

    setSelectedAluno(aluno);
    setCart(newCart);
    setSaleError(null);
    setPhase("voice-confirm");
  }

  function startVoice() {
    const SR =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Reconhecimento de voz não suportado. Use Chrome ou Edge.");
      return;
    }
    setVoiceError(null);
    const rec = new SR();
    rec.lang = "pt-BR";
    // continuous:true para não parar na primeira pausa — essencial para pedidos longos.
    // O silêncio de 1,5s após o último resultado dispara rec.stop() manualmente.
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let fullTranscript = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const stopAfterSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => rec.stop(), 3000);
    };

    rec.onstart = () => setListening(true);

    rec.onresult = (e: any) => {
      // Acumula todos os blocos finais (o browser pode enviar vários com continuous:true)
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const chunk = e.results[i][0].transcript;
          fullTranscript += (fullTranscript ? " " : "") + chunk;
        }
      }
      stopAfterSilence();
    };

    rec.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setListening(false);
      if (fullTranscript.trim()) {
        processVoiceCommand(fullTranscript.trim());
      }
    };

    rec.onerror = (e: any) => {
      if (silenceTimer) clearTimeout(silenceTimer);
      // "no-speech" não é erro real — o onend vai disparar naturalmente
      if (e.error === "no-speech") return;
      setListening(false);
      setVoiceError("Não foi possível capturar o áudio. Tente novamente.");
    };

    rec.start();
  }

  // ── Confirmar venda ────────────────────────────────────────────────────────

  async function confirmSale() {
    if (!canConfirm || !selectedAluno) return;
    setConfirming(true);
    setSaleError(null);

    const supabase = createClient();

    if (selectedAluno.limite_diario > 0) {
      const now = new Date();
      const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      ).toISOString();

      const { data: pedidosHoje, error: limiteErr } = await supabase
        .from("pedidos")
        .select("total")
        .eq("aluno_id", selectedAluno.id)
        .eq("cantina_id", CANTINA_ID)
        .gte("created_at", todayStart);

      if (limiteErr) {
        setSaleError(limiteErr.message);
        setConfirming(false);
        return;
      }

      const gastoHoje = (pedidosHoje ?? []).reduce(
        (s: number, p: any) => s + (p.total ?? 0),
        0
      );

      if (gastoHoje + total > selectedAluno.limite_diario) {
        setSaleError(
          `Limite diário de ${fmt(selectedAluno.limite_diario)} atingido. Já consumiu ${fmt(gastoHoje)} hoje.`
        );
        setConfirming(false);
        return;
      }
    }

    if (isFiado) {
      await (supabase as any)
        .from("contas")
        .update({ tipo: "fiado" })
        .eq("aluno_id", selectedAluno.id);
    }

    const { data: pedido, error: pedidoErr } = await supabase
      .from("pedidos")
      .insert({ cantina_id: CANTINA_ID, aluno_id: selectedAluno.id, total } as any)
      .select("id")
      .single();

    if (pedidoErr) {
      setSaleError(pedidoErr.message);
      setConfirming(false);
      return;
    }

    const { error: itensErr } = await (supabase as any).from("itens_pedido").insert(
      cartItems.map(({ product, qty }) => ({
        pedido_id: (pedido as any).id,
        produto_id: product.id,
        nome_produto: product.nome,
        quantidade: qty,
        preco_unitario: product.preco,
      }))
    );

    if (itensErr) {
      setSaleError(itensErr.message);
      setConfirming(false);
      return;
    }

    const novoSaldo = selectedAluno.saldo - total;
    const alunoUpdate: Record<string, unknown> = { saldo: novoSaldo };
    if (isFiado) alunoUpdate.conta_paga = false;

    const { error: saldoErr } = await (supabase as any)
      .from("alunos")
      .update(alunoUpdate)
      .eq("id", selectedAluno.id);

    if (saldoErr) {
      setSaleError(saldoErr.message);
      setConfirming(false);
      return;
    }

    await (supabase as any)
      .from("contas")
      .update({ saldo: novoSaldo })
      .eq("aluno_id", selectedAluno.id);

    setAlunos((prev) =>
      prev.map((a) =>
        a.id === selectedAluno.id ? { ...a, saldo: novoSaldo } : a
      )
    );

    setSuccessName(selectedAluno.nome);
    setConfirming(false);
    setPhase("success");

    setTimeout(() => {
      setSelectedAluno(null);
      setCart({});
      setSaleError(null);
      setVoiceWarning(null);
      setPhase("search");
    }, 2000);
  }

  // ── SUCCESS ────────────────────────────────────────────────────────────────

  if (phase === "success") {
    return (
      <div className="fixed inset-0 bg-cp-bg flex flex-col items-center justify-center gap-6 z-50">
        <div className="w-32 h-32 rounded-full bg-emerald-500/10 border-2 border-emerald-500/25 flex items-center justify-center">
          <span className="text-6xl text-emerald-400">✓</span>
        </div>
        <div className="text-center space-y-1">
          <p className="text-3xl font-bold text-white">Venda confirmada!</p>
          <p className="text-lg text-gray-400">{successName}</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-1">Pronto para próxima venda...</p>
      </div>
    );
  }

  // ── CONFIRMAÇÃO DE VOZ ────────────────────────────────────────────────────

  if (phase === "voice-confirm") {
    const voiceCanConfirm = isFiado || (saldoApos ?? -1) >= 0;

    return (
      <div className="bg-cp-bg min-h-[100dvh] flex flex-col">
        <header className="shrink-0 bg-cp-surface border-b border-cp-border px-5 py-3.5 flex items-center gap-3">
          <button
            onClick={backToSearch}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-cp-elevated transition text-lg"
          >
            ←
          </button>
          <div className="w-px h-5 bg-cp-border" />
          <div className="w-7 h-7 bg-orange-500 rounded-md flex items-center justify-center text-sm shadow-md shadow-orange-500/30">
            🎤
          </div>
          <span className="font-semibold text-white">Confirmar Pedido</span>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Aluno */}
          <div className="bg-cp-surface border border-cp-border rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/15 rounded-full flex items-center justify-center text-xl shrink-0">
              👤
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-lg leading-tight truncate">
                {selectedAluno!.nome}
              </p>
              <p className="text-gray-500 text-sm mt-0.5">{selectedAluno!.turma}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-500 mb-0.5">Saldo atual</p>
              <p className={`font-bold text-lg ${balanceColor(selectedAluno!.saldo)}`}>
                {fmt(selectedAluno!.saldo)}
              </p>
            </div>
          </div>

          {/* Produtos reconhecidos */}
          <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-cp-border">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Produtos
              </p>
            </div>
            {cartItems.map(({ product, qty }, idx) => (
              <div
                key={product.id}
                className={`flex items-center gap-4 px-5 py-4 ${
                  idx < cartItems.length - 1 ? "border-b border-cp-border" : ""
                }`}
              >
                <div className="w-10 h-10 bg-cp-elevated rounded-xl flex items-center justify-center text-xl shrink-0 overflow-hidden">
                  {product.foto_url ? (
                    <img
                      src={product.foto_url}
                      alt={product.nome}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    product.emoji
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm leading-tight truncate">
                    {product.nome}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {qty}× {fmt(product.preco)}
                  </p>
                </div>
                <p className="text-white font-bold text-sm shrink-0">
                  {fmt(product.preco * qty)}
                </p>
              </div>
            ))}
          </div>

          {/* Total e saldo após */}
          <div className="bg-cp-surface border border-cp-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cp-border">
              <span className="text-gray-400 text-sm">Total da venda</span>
              <span className="text-white font-bold text-xl">{fmt(total)}</span>
            </div>
            <div
              className={`flex items-center justify-between px-5 py-4 ${
                saldoApos! >= 0
                  ? "bg-emerald-500/5"
                  : isFiado
                  ? "bg-amber-500/5"
                  : "bg-red-500/10"
              }`}
            >
              <span
                className={`text-sm ${
                  saldoApos! >= 0
                    ? "text-emerald-400"
                    : isFiado
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {saldoApos! < 0 && isFiado ? "Dívida após venda" : "Saldo após venda"}
              </span>
              <span
                className={`font-bold text-lg ${
                  saldoApos! >= 0
                    ? "text-emerald-400"
                    : isFiado
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {fmt(saldoApos!)}
              </span>
            </div>
          </div>

          {/* Produtos não reconhecidos pelo comando de voz */}
          {voiceWarning && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
              {voiceWarning}
            </div>
          )}

          {/* Erro ao processar venda */}
          {saleError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 text-center">
              {saleError}
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="shrink-0 bg-cp-surface border-t border-cp-border px-4 pt-4 pb-6 flex gap-3">
          <button
            onClick={backToSearch}
            disabled={confirming}
            className="flex-1 py-4 rounded-2xl font-bold text-base border-2 border-cp-border text-gray-400 hover:text-white hover:border-cp-muted transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={confirmSale}
            disabled={!voiceCanConfirm || confirming}
            className={`flex-[2] py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
              voiceCanConfirm && !confirming
                ? "bg-orange-500 hover:bg-orange-600 active:scale-[.98] text-white shadow-xl shadow-orange-500/20"
                : "bg-cp-elevated text-gray-600 border border-cp-border"
            }`}
          >
            {confirming ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <span className="text-lg">✓</span>
                Confirmar Venda
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── BUSCA DE ALUNO ─────────────────────────────────────────────────────────

  if (phase === "search") {
    const hasSearch = search.trim().length > 0;

    return (
      <div className="bg-cp-bg min-h-[100dvh] flex flex-col">
        {/* Header */}
        <header className="shrink-0 bg-cp-surface border-b border-cp-border px-5 py-3.5 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-cp-elevated transition text-lg"
          >
            ←
          </Link>
          <div className="w-px h-5 bg-cp-border" />
          <div className="w-7 h-7 bg-orange-500 rounded-md flex items-center justify-center text-sm shadow-md shadow-orange-500/30">
            🍽️
          </div>
          <span className="font-semibold text-white">Nova Venda</span>
        </header>

        {/* Área de busca centralizada */}
        <div className="flex-1 flex flex-col items-center px-5 pt-12 sm:pt-20">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
              Passo 1 de 2
            </p>
            <h1 className="text-2xl font-bold text-white">Quem vai comprar?</h1>
          </div>

          <div className="w-full max-w-md">
            {/* Input de texto */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl pointer-events-none">
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Nome ou turma..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (voiceError) setVoiceError(null);
                }}
                className="w-full pl-12 pr-12 py-5 text-xl rounded-2xl bg-cp-surface border-2 border-cp-border text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-cp-elevated transition text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdown de sugestões */}
            {hasSearch && !loadingData && (
              <div className="mt-2 bg-cp-surface border border-cp-border rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
                {suggestions.length > 0 ? (
                  suggestions.map((a, idx) => (
                    <button
                      key={a.id}
                      onClick={() => selectAluno(a)}
                      className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-cp-elevated active:bg-orange-500/10 transition-colors text-left ${
                        idx < suggestions.length - 1
                          ? "border-b border-cp-border"
                          : ""
                      }`}
                    >
                      <div className="w-11 h-11 bg-orange-500/10 border border-orange-500/15 rounded-full flex items-center justify-center shrink-0 text-lg">
                        👤
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-base leading-tight truncate">
                          {a.nome}
                        </p>
                        <p className="text-gray-500 text-sm mt-0.5">{a.turma}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold ${balanceColor(a.saldo)}`}>
                          {fmt(a.saldo)}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 capitalize">{a.tipo}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-5 py-6 text-center">
                    <p className="text-gray-500 text-sm">
                      Nenhum aluno encontrado para &quot;{search}&quot;
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Botão de voz — visível quando não está digitando */}
            {!hasSearch && !loadingData && (
              <>
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-cp-border" />
                  <span className="text-xs text-gray-600 uppercase tracking-widest">ou</span>
                  <div className="flex-1 h-px bg-cp-border" />
                </div>

                <button
                  onClick={startVoice}
                  disabled={listening}
                  className={`w-full py-5 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 border-2 transition-all active:scale-[.98] ${
                    listening
                      ? "bg-red-500/10 border-red-500/40 text-red-400 cursor-not-allowed"
                      : "bg-cp-surface border-cp-border text-gray-300 hover:border-orange-500/60 hover:text-orange-400 hover:bg-orange-500/5"
                  }`}
                >
                  <span className={`text-2xl${listening ? " animate-pulse" : ""}`}>🎤</span>
                  <span>{listening ? "Ouvindo... fale agora" : "Falar pedido completo"}</span>
                </button>

                <p className="text-center text-gray-600 text-xs mt-3">
                  Ex: &quot;Gustavo Silva, um X-Burguer e uma Coca Cola&quot;
                </p>
              </>
            )}

            {/* Erro de voz */}
            {voiceError && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 text-center">
                {voiceError}
              </div>
            )}

            {/* Dica de texto */}
            {!hasSearch && !loadingData && (
              <p className="text-center text-gray-600 text-sm mt-5">
                {alunos.length} alunos disponíveis · comece a digitar
              </p>
            )}
            {loadingData && (
              <p className="text-center text-gray-600 text-sm mt-6">
                Carregando alunos...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SELEÇÃO DE PRODUTOS ────────────────────────────────────────────────────

  return (
    <div className="bg-cp-bg h-[100dvh] flex flex-col">

      {/* Header: voltar + chip do aluno + badge de itens */}
      <header className="shrink-0 bg-cp-surface border-b border-cp-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={backToSearch}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-cp-elevated transition text-lg shrink-0"
        >
          ←
        </button>

        <button
          onClick={backToSearch}
          className="flex-1 flex items-center gap-3 bg-orange-500/10 border border-orange-500/25 rounded-xl px-3 py-2 min-w-0 hover:bg-orange-500/15 transition-colors text-left"
        >
          <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 text-base">
            👤
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate leading-tight">
              {selectedAluno!.nome}
            </p>
            <p className="text-gray-500 text-xs">{selectedAluno!.turma}</p>
          </div>
          <span
            className={`text-sm font-bold shrink-0 ${balanceColor(selectedAluno!.saldo)}`}
          >
            {fmt(selectedAluno!.saldo)}
          </span>
        </button>

        {totalItens > 0 && (
          <div className="w-9 h-9 flex items-center justify-center bg-orange-500 rounded-xl shrink-0 shadow-lg shadow-orange-500/30">
            <span className="text-white font-bold text-sm">{totalItens}</span>
          </div>
        )}
      </header>

      {/* Aviso de produtos não reconhecidos pelo comando de voz */}
      {voiceWarning && (
        <div className="shrink-0 mx-4 mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-400 leading-snug">{voiceWarning}</p>
          <button
            onClick={() => setVoiceWarning(null)}
            className="shrink-0 text-amber-500 hover:text-amber-300 transition text-base leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Abas de categoria */}
      {!loadingData && (
        <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const active = categoriaSelecionada === tab.value;
            const count  = counts[tab.value] ?? 0;
            return (
              <button
                key={tab.value}
                onClick={() => setCategoriaSelecionada(tab.value)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  active
                    ? "bg-orange-500/15 border-orange-500/50 text-orange-400"
                    : "bg-cp-elevated border-cp-border text-gray-400 hover:text-gray-200 hover:border-cp-muted"
                }`}
              >
                {tab.label}
                <span className={`text-xs tabular-nums px-1.5 py-0 rounded-full ${
                  active ? "bg-orange-500/20 text-orange-300" : "bg-cp-surface text-gray-600"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid de produtos */}
      <div className="flex-1 overflow-y-auto">
        {loadingData ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[168px] rounded-2xl bg-cp-surface border border-cp-border animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 pb-44">
            {produtosFiltrados.map((p) => {
              const qty = cart[p.id] ?? 0;
              const outOfStock = p.estoque === 0;
              const lowStock = p.estoque > 0 && p.estoque < 5;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border flex flex-col transition-all overflow-hidden ${
                    outOfStock
                      ? "border-cp-border bg-cp-surface opacity-40"
                      : qty > 0
                      ? "border-orange-500/40 bg-orange-500/5 shadow-lg shadow-orange-500/5"
                      : "border-cp-border bg-cp-surface hover:border-cp-muted"
                  }`}
                >
                  {/* Área de toque principal → +1 */}
                  <button
                    onClick={() => !outOfStock && addProduct(p.id)}
                    disabled={outOfStock}
                    className="flex-1 flex flex-col text-left active:scale-95 transition-transform disabled:cursor-not-allowed"
                  >
                    {p.foto_url ? (
                      <img
                        src={p.foto_url}
                        alt={p.nome}
                        className="w-full h-[120px] object-cover"
                      />
                    ) : (
                      <div className="w-full h-[120px] bg-cp-elevated flex items-center justify-center">
                        <span className="text-4xl leading-none">{p.emoji}</span>
                      </div>
                    )}
                    <div className="p-3 pt-2 pb-1">
                      <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
                        {p.nome}
                      </p>
                      <p className="text-orange-400 font-bold text-base mt-1.5">
                        {fmt(p.preco)}
                      </p>
                      {outOfStock ? (
                        <span className="mt-1.5 inline-block text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                          Esgotado
                        </span>
                      ) : lowStock ? (
                        <span className="mt-1.5 inline-block text-[11px] bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
                          Últimas {p.estoque}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  {/* Controles de quantidade */}
                  <div className="px-3 pb-3 pt-1">
                    {qty > 0 ? (
                      <div className="flex items-center bg-cp-elevated border border-cp-border rounded-xl overflow-hidden">
                        <button
                          onClick={() => removeProduct(p.id)}
                          className="flex-1 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-cp-muted transition text-xl font-bold"
                        >
                          −
                        </button>
                        <span className="flex-1 text-center text-white font-bold text-base select-none">
                          {qty}
                        </span>
                        <button
                          onClick={() => addProduct(p.id)}
                          className="flex-1 h-10 flex items-center justify-center text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition text-xl font-bold"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => !outOfStock && addProduct(p.id)}
                        disabled={outOfStock}
                        className="w-full h-10 rounded-xl bg-cp-elevated hover:bg-cp-muted active:bg-orange-500/10 text-gray-500 hover:text-orange-400 transition font-bold text-2xl disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra inferior fixa: total + confirmação */}
      <div className="shrink-0 bg-cp-surface border-t border-cp-border px-4 pt-4 pb-6 space-y-3">

        {/* Saldo após venda */}
        {cartItems.length > 0 && saldoApos !== null && (
          <div
            className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
              saldoApos >= 0
                ? "bg-emerald-500/5 border border-emerald-500/15 text-emerald-400"
                : isFiado
                ? "bg-amber-500/5 border border-amber-500/15 text-amber-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}
          >
            <span>
              {saldoApos < 0 && isFiado
                ? "Dívida acumulada após venda"
                : "Saldo após venda"}
            </span>
            <span className="font-bold">{fmt(saldoApos)}</span>
          </div>
        )}

        {/* Erro */}
        {saleError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs text-red-400 text-center">
            {saleError}
          </div>
        )}

        {/* Total + botão confirmar */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-2xl font-bold text-white leading-tight">{fmt(total)}</p>
          </div>

          <button
            onClick={confirmSale}
            disabled={!canConfirm || confirming}
            className={`flex-1 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
              canConfirm && !confirming
                ? "bg-orange-500 hover:bg-orange-600 active:scale-[.98] text-white shadow-xl shadow-orange-500/20"
                : "bg-cp-elevated text-gray-600 border border-cp-border"
            }`}
          >
            {confirming ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <span className="text-lg">✓</span>
                Confirmar Venda
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
