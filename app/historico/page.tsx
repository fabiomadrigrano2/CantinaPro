import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import HistoricoList from "@/components/historico/HistoricoList";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function todayBR(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("/")
    .reverse()
    .join("-");
}

function dateRangeBR(date: string): { start: string; end: string } {
  const [y, m, d] = date.split("-").map(Number);
  // Brazil is UTC-3 (no DST since 2019): midnight BR = 03:00 UTC
  const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: { data?: string };
}) {
  const supabase = createClient();
  const date = searchParams.data ?? todayBR();
  const { start, end } = dateRangeBR(date);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select(`
      id,
      criado_em,
      total,
      status,
      cancelado_por_nome,
      cancelado_em,
      alunos ( nome, turma, tipo_conta ),
      itens_pedido ( nome_produto, quantidade, preco_unitario, produtos ( nome ) )
    `)
    .eq("cantina_id", CANTINA_ID)
    .in("status", ["confirmado", "cancelado"])
    .gte("criado_em", start)
    .lt("criado_em", end)
    .order("criado_em", { ascending: false });

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Histórico</h1>
        <p className="text-sm text-gray-500 mt-1">Pedidos realizados na cantina</p>
      </div>
      <HistoricoList
        initialPedidos={(pedidos as any) ?? []}
        dataAtual={date}
      />
    </AppLayout>
  );
}
