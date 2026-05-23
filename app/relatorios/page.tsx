import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import RelatoriosView from "@/components/relatorios/RelatoriosView";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

// ── tipos exportados para os componentes filhos ───────────────────────────────

export type DiaVenda    = { date: string; total: number };
export type TopAluno    = { nome: string; turma: string | null; total: number };
export type TopProduto  = { nome: string; qtd: number; receita: number };
export type ProdutoStock = { id: string; nome: string; emoji: string | null; estoque: number; estoque_minimo: number; categoria: string | null };

export type RelatorioData = {
  periodo:         "semanal" | "mensal";
  periodoLabel:    string;
  totalArrecadado: number;
  totalPedidos:    number;
  ticketMedio:     number;
  vendasPorDia:    DiaVenda[];
  top5Alunos:      TopAluno[];
  topProdutos:     TopProduto[];
  criticos:        ProdutoStock[];
  esgotados:       ProdutoStock[];
};

// ── helpers de data (UTC-3) ───────────────────────────────────────────────────

function todayBR() {
  // Brazil = UTC-3, sem horário de verão desde 2019.
  // Subtrair 3 h do tempo UTC e usar getUTC* dá os componentes da data no Brasil.
  const br = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { year: br.getUTCFullYear(), month: br.getUTCMonth() + 1, day: br.getUTCDate() };
}

function periodRange(periodo: string): { start: string; end: string; label: string } {
  const { year, month, day } = todayBR();

  if (periodo === "mensal") {
    const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
    const end   = new Date(Date.UTC(year, month,     1, 3, 0, 0));
    const label = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("pt-BR", {
      month: "long", year: "numeric", timeZone: "UTC",
    });
    return { start: start.toISOString(), end: end.toISOString(), label };
  }

  // semanal — últimos 7 dias incluindo hoje
  const startUTC = new Date(Date.UTC(year, month - 1, day - 6, 3, 0, 0));
  const endUTC   = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0));
  const fmtShort = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    start: startUTC.toISOString(),
    end:   endUTC.toISOString(),
    label: `${fmtShort(startUTC)} – ${fmtShort(new Date(endUTC.getTime() - 86400000))}`,
  };
}

function allDaysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  const fin = new Date(end);
  while (cur < fin) {
    days.push(`${String(cur.getUTCDate()).padStart(2, "0")}/${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const periodo = (searchParams.periodo === "mensal" ? "mensal" : "semanal") as "semanal" | "mensal";
  const { start, end, label: periodoLabel } = periodRange(periodo);
  const supabase = createClient();

  const [{ data: pedidos }, { data: produtos }] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id, aluno_id, total, criado_em, alunos(nome, turma), itens_pedido(nome_produto, quantidade, preco_unitario, produtos(nome))")
      .eq("cantina_id", CANTINA_ID)
      .eq("status", "confirmado")
      .gte("criado_em", start)
      .lt("criado_em", end),
    supabase
      .from("produtos")
      .select("id, nome, emoji, estoque, estoque_minimo, disponivel, categoria")
      .eq("cantina_id", CANTINA_ID)
      .order("estoque"),
  ]);

  const pedidosList  = (pedidos  as any[]) ?? [];
  const produtosList = (produtos as any[]) ?? [];

  // ── métricas financeiras ───────────────────────────────────────────────────
  const totalArrecadado = pedidosList.reduce((s: number, p: any) => s + (p.total ?? 0), 0);
  const totalPedidos    = pedidosList.length;
  const ticketMedio     = totalPedidos > 0 ? totalArrecadado / totalPedidos : 0;

  // ── vendas por dia ─────────────────────────────────────────────────────────
  const vendasMap: Record<string, number> = {};
  for (const p of pedidosList) vendasMap[dayLabel(p.criado_em)] = (vendasMap[dayLabel(p.criado_em)] ?? 0) + (p.total ?? 0);
  const vendasPorDia: DiaVenda[] = allDaysInRange(start, end).map((d) => ({ date: d, total: vendasMap[d] ?? 0 }));

  // ── top 5 alunos ──────────────────────────────────────────────────────────
  const alunosMap: Record<string, TopAluno> = {};
  for (const p of pedidosList) {
    if (!p.aluno_id || !p.alunos) continue;
    if (!alunosMap[p.aluno_id]) alunosMap[p.aluno_id] = { nome: p.alunos.nome, turma: p.alunos.turma, total: 0 };
    alunosMap[p.aluno_id].total += p.total ?? 0;
  }
  const top5Alunos: TopAluno[] = Object.values(alunosMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // ── top produtos ──────────────────────────────────────────────────────────
  const prodMap: Record<string, TopProduto> = {};
  for (const p of pedidosList) {
    for (const item of (p.itens_pedido ?? [])) {
      const k = item.nome_produto || item.produtos?.nome || "Produto";
      if (!prodMap[k]) prodMap[k] = { nome: k, qtd: 0, receita: 0 };
      prodMap[k].qtd     += item.quantidade ?? 1;
      prodMap[k].receita += (item.quantidade ?? 1) * (item.preco_unitario ?? 0);
    }
  }
  const topProdutos: TopProduto[] = Object.values(prodMap)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 10);

  // ── estoque ───────────────────────────────────────────────────────────────
  const criticos: ProdutoStock[]  = produtosList.filter((p: any) => p.estoque > 0  && p.estoque <= (p.estoque_minimo ?? 5));
  const esgotados: ProdutoStock[] = produtosList.filter((p: any) => p.estoque === 0);

  const data: RelatorioData = {
    periodo, periodoLabel,
    totalArrecadado, totalPedidos, ticketMedio,
    vendasPorDia, top5Alunos, topProdutos, criticos, esgotados,
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral financeira e de estoque</p>
      </div>
      <RelatoriosView data={data} />
    </AppLayout>
  );
}
