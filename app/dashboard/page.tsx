import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppLayout from "@/components/layout/AppLayout";
import CardapioDoDia from "@/components/dashboard/CardapioDoDia";
import Link from "next/link";

// ── constantes ────────────────────────────────────────────────────────────────

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Metric = {
  label: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "neutral";
  icon: string;
};

type AlunoSaldo = {
  nome: string;
  turma: string | null;
  saldo: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function formatDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
}

function todayBR(): string {
  // Aritmética direta em vez de Intl.DateTimeFormat(timeZone: ...): o cardápio
  // do dia estava sendo lido com a data em UTC em vez de America/Sao_Paulo,
  // então em vez de depender do runtime resolver o fuso horário via ICU,
  // calculamos o offset fixo BR = UTC-3 (sem horário de verão desde 2019) —
  // mesma premissa já usada em dateRangeBR() logo abaixo.
  const now    = new Date();
  const brTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = brTime.getUTCFullYear();
  const m = String(brTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brTime.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateRangeBR(date: string): { start: string; end: string } {
  const [y, m, d] = date.split("-").map(Number);
  // Brazil is UTC-3 (no DST since 2019): midnight BR = 03:00 UTC
  const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function calcTrend(
  hoje: number,
  ontem: number,
  formatValue: (v: number) => string,
  emptyLabel: string,
): { trend: "up" | "down" | "neutral"; sub: string } {
  if (hoje === 0 && ontem === 0) return { trend: "neutral", sub: emptyLabel };
  if (ontem === 0)               return { trend: "up",      sub: "primeiros registros do dia" };
  const pct = ((hoje - ontem) / ontem) * 100;
  if (Math.abs(pct) < 1)         return { trend: "neutral", sub: "igual a ontem" };
  return {
    trend: pct > 0 ? "up" : "down",
    sub:   `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs ontem (${formatValue(ontem)})`,
  };
}

// ── sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl p-5 flex flex-col gap-3 hover:border-cp-muted transition">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{metric.icon}</span>
        {metric.trend === "up" && (
          <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
            ↑ alta
          </span>
        )}
        {metric.trend === "down" && (
          <span className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
            ↓ queda
          </span>
        )}
      </div>
      <div>
        <p className="text-gray-400 text-sm">{metric.label}</p>
        <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">{metric.value}</p>
      </div>
      <p className="text-xs text-gray-500 leading-snug">{metric.sub}</p>
    </div>
  );
}

function AlunoRow({
  aluno,
  variant,
}: {
  aluno: AlunoSaldo;
  variant: "saldo" | "cobranca";
}) {
  const isSaldo    = variant === "saldo";
  const isNegative = aluno.saldo < 0;
  const isZero     = aluno.saldo === 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cp-border bg-cp-surface hover:bg-cp-elevated transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${
        isSaldo
          ? "bg-amber-400/10 text-amber-400"
          : "bg-red-500/10 text-red-400"
      }`}>
        👤
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{aluno.nome}</p>
        <p className="text-xs text-gray-500 mt-0.5">{aluno.turma ?? "—"}</p>
      </div>

      {isSaldo ? (
        <span className={`text-sm font-bold tabular-nums ${
          isNegative ? "text-red-400" : isZero ? "text-gray-400" : "text-amber-400"
        }`}>
          {fmt(aluno.saldo)}
        </span>
      ) : (
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-red-400 tabular-nums">
            {fmt(Math.abs(aluno.saldo))}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">em aberto</p>
        </div>
      )}
    </div>
  );
}

// ── página ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase      = createClient();
  const supabaseAdmin = createAdminClient();

  // Limites de data em UTC
  const now          = new Date();
  const todayUTC     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayUTC = new Date(todayUTC);
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
  const todayISO     = todayUTC.toISOString();
  const yesterdayISO = yesterdayUTC.toISOString();

  const hoje = todayBR();
  const { start: hojeStart, end: hojeEnd } = dateRangeBR(hoje);

  // Todas as queries em paralelo
  const [
    { data: { user } },
    { data: vendasHoje },
    { data: vendasOntem },
    { count: nHoje },
    { count: nOntem },
    { data: rawSaldoBaixo },
    { data: rawCobrancas },
    { data: rawCardapio, error: cardapioError },
    { data: produtosAtivos },
    { data: pedidosHojeParaCardapio },
  ] = await Promise.all([
    supabase.auth.getUser(),

    // Totais de vendas (para métricas 1 e 4) — só pedidos confirmados, excluindo cancelados
    supabase.from("pedidos").select("total")
      .eq("cantina_id", CANTINA_ID).eq("status", "confirmado").gte("created_at", todayISO),
    supabase.from("pedidos").select("total")
      .eq("cantina_id", CANTINA_ID).eq("status", "confirmado").gte("created_at", yesterdayISO).lt("created_at", todayISO),

    // Contagem de pedidos (métrica 2) — mesma regra: exclui cancelados
    supabase.from("pedidos").select("id", { count: "exact", head: true })
      .eq("cantina_id", CANTINA_ID).eq("status", "confirmado").gte("created_at", todayISO),
    supabase.from("pedidos").select("id", { count: "exact", head: true })
      .eq("cantina_id", CANTINA_ID).eq("status", "confirmado").gte("created_at", yesterdayISO).lt("created_at", todayISO),

    // Alunos com saldo baixo ≤ R$ 10 (métrica 3 + seção de alertas)
    supabase.from("contas").select("saldo, alunos(nome, turma)")
      .eq("cantina_id", CANTINA_ID).lte("saldo", 10).order("saldo").limit(50),

    // Fiado com saldo ≤ 0 (cobranças pendentes)
    supabase.from("contas").select("saldo, alunos(nome, turma)")
      .eq("cantina_id", CANTINA_ID).eq("tipo", "fiado").lte("saldo", 0).order("saldo").limit(50),

    // Cardápio do dia — client admin (service role): a leitura via client
    // autenticado ficava vazia mesmo com a linha existindo no banco, então
    // usamos o mesmo client que já grava o cardápio em salvarCardapioDoDia()
    // pra tirar RLS da equação. Sem embed de produtos() pelo mesmo motivo já
    // documentado antes (FK nova, schema cache do PostgREST) — nome/emoji são
    // resolvidos separadamente abaixo.
    supabaseAdmin.from("cardapio_diario")
      .select("produto_id, quantidade_disponivel")
      .eq("cantina_id", CANTINA_ID).eq("data", hoje),

    // Produtos ativos disponíveis para compor o cardápio — só salgados,
    // que é a categoria que o Cardápio do Dia controla
    supabase.from("produtos")
      .select("id, nome, emoji, categoria, estoque")
      .eq("cantina_id", CANTINA_ID).eq("disponivel", true).eq("categoria", "salgados").order("nome"),

    // Vendas confirmadas de hoje (para calcular quanto já foi vendido de cada item do cardápio)
    supabase.from("pedidos")
      .select("itens_pedido(produto_id, quantidade)")
      .eq("cantina_id", CANTINA_ID).eq("status", "confirmado")
      .gte("criado_em", hojeStart).lt("criado_em", hojeEnd),
  ]);

  // ── processar dados ───────────────────────────────────────────────────────────

  const totalHoje  = (vendasHoje  ?? []).reduce((s, p: any) => s + (p.total ?? 0), 0);
  const totalOntem = (vendasOntem ?? []).reduce((s, p: any) => s + (p.total ?? 0), 0);
  const pedHoje    = nHoje  ?? 0;
  const pedOntem   = nOntem ?? 0;

  const ticketHoje  = pedHoje  > 0 ? totalHoje  / pedHoje  : 0;
  const ticketOntem = pedOntem > 0 ? totalOntem / pedOntem : 0;

  const saldoBaixo: AlunoSaldo[] = (rawSaldoBaixo ?? []).map((c: any) => ({
    nome:  c.alunos?.nome  ?? "—",
    turma: c.alunos?.turma ?? null,
    saldo: c.saldo ?? 0,
  }));

  const cobrancas: AlunoSaldo[] = (rawCobrancas ?? []).map((c: any) => ({
    nome:  c.alunos?.nome  ?? "—",
    turma: c.alunos?.turma ?? null,
    saldo: c.saldo ?? 0,
  }));

  if (cardapioError) {
    console.error("[dashboard] falha ao buscar cardapio_diario:", cardapioError.message);
  }
  console.log("[dashboard][cardapio] hoje =", hoje);
  console.log("[dashboard][cardapio] rawCardapio =", JSON.stringify(rawCardapio));
  console.log(
    "[dashboard][cardapio] produtosAtivos (salgados) =",
    JSON.stringify((produtosAtivos ?? []).map((p: any) => ({ id: p.id, nome: p.nome, categoria: p.categoria })))
  );

  const vendidoPorProduto: Record<string, number> = {};
  for (const pedido of (pedidosHojeParaCardapio ?? []) as any[]) {
    for (const item of pedido.itens_pedido ?? []) {
      vendidoPorProduto[item.produto_id] =
        (vendidoPorProduto[item.produto_id] ?? 0) + (item.quantidade ?? 0);
    }
  }

  // Resolve nome/emoji pela lista de produtos já carregada (produtosAtivos já
  // filtra só salgados, que é a única categoria que entra no cardápio) — evita
  // depender do embed automático produtos() na query de cardapio_diario acima.
  const produtoPorId = new Map<string, any>(
    ((produtosAtivos as any) ?? []).map((p: any) => [p.id, p])
  );

  const cardapioAtual = (rawCardapio ?? []).map((c: any) => {
    const produto = produtoPorId.get(c.produto_id);
    const vendido = vendidoPorProduto[c.produto_id] ?? 0;
    return {
      produto_id: c.produto_id,
      nome: produto?.nome ?? "—",
      emoji: produto?.emoji ?? "🍽️",
      quantidade_disponivel: c.quantidade_disponivel,
      vendido,
      sobrou: c.quantidade_disponivel - vendido,
    };
  });

  console.log("[dashboard][cardapio] cardapioAtual (o que vai pro componente) =", JSON.stringify(cardapioAtual));

  // ── métricas ──────────────────────────────────────────────────────────────────

  const tVendas  = calcTrend(totalHoje,  totalOntem,  fmt,               "sem vendas ainda hoje");
  const tPedidos = calcTrend(pedHoje,    pedOntem,    String,            "sem pedidos ainda hoje");
  const tTicket  = calcTrend(ticketHoje, ticketOntem, fmt,               "sem vendas hoje");

  const metrics: Metric[] = [
    {
      label: "Vendas hoje",
      value: fmt(totalHoje),
      sub:   tVendas.sub,
      trend: tVendas.trend,
      icon:  "💰",
    },
    {
      label: "Pedidos hoje",
      value: String(pedHoje),
      sub:   tPedidos.sub,
      trend: tPedidos.trend,
      icon:  "🛒",
    },
    {
      label: "Saldo baixo",
      value: String(saldoBaixo.length),
      sub:   saldoBaixo.length === 0
        ? "todos com saldo adequado"
        : `aluno${saldoBaixo.length !== 1 ? "s" : ""} com saldo ≤ R$ 10`,
      trend: saldoBaixo.length === 0 ? "neutral" : saldoBaixo.length > 5 ? "down" : "neutral",
      icon:  "⚠️",
    },
    {
      label: "Ticket médio",
      value: fmt(ticketHoje),
      sub:   tTicket.sub,
      trend: tTicket.trend,
      icon:  "🎯",
    },
  ];

  // ── render ────────────────────────────────────────────────────────────────────

  const firstName = user?.email?.split("@")[0] ?? "usuário";
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <AppLayout>
      <div className="space-y-10">

        {/* Saudação + Nova Venda */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white capitalize">
              {greeting}, {firstName}!
            </h1>
            <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatDate()}</p>
          </div>
          <Link
            href="/vendas/nova"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-orange-500/25 transition-all"
          >
            <span className="text-lg leading-none">+</span>
            Nova Venda
          </Link>
        </div>

        {/* Cardápio do dia */}
        <CardapioDoDia
          hoje={hoje}
          produtosDisponiveis={(produtosAtivos as any) ?? []}
          cardapioAtual={cardapioAtual}
        />

        {/* Métricas — 2 colunas em mobile, 4 em desktop */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
            Resumo do dia
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((m) => <MetricCard key={m.label} metric={m} />)}
          </div>
        </section>

        {/* Alertas de saldo baixo */}
        {saldoBaixo.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Saldo baixo
              </h2>
              <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                {saldoBaixo.length}
              </span>
            </div>
            <div className="space-y-2">
              {saldoBaixo.map((a) => (
                <AlunoRow key={`saldo-${a.nome}`} aluno={a} variant="saldo" />
              ))}
            </div>
          </section>
        )}

        {/* Cobranças pendentes (fiado com saldo ≤ 0) */}
        {cobrancas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Cobranças pendentes
              </h2>
              <span className="text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                {cobrancas.length}
              </span>
            </div>
            <div className="space-y-2">
              {cobrancas.map((a) => (
                <AlunoRow key={`cobranca-${a.nome}`} aluno={a} variant="cobranca" />
              ))}
            </div>

            {/* Total em aberto */}
            <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/15">
              <span className="text-xs text-gray-500">Total em aberto</span>
              <span className="text-sm font-bold text-red-400 tabular-nums">
                {fmt(Math.abs(cobrancas.reduce((s, a) => s + a.saldo, 0)))}
              </span>
            </div>
          </section>
        )}

      </div>
    </AppLayout>
  );
}
