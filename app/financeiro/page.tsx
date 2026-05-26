import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import FinanceiroView from "@/components/financeiro/FinanceiroView";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export default async function FinanceiroPage() {
  const supabase = createClient();

  // Data de hoje no fuso Brasil (UTC-3)
  const br = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const startToday    = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(),     3, 0, 0));
  const startTomorrow = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() + 1, 3, 0, 0));
  const dataHoje = [
    br.getUTCFullYear(),
    String(br.getUTCMonth() + 1).padStart(2, "0"),
    String(br.getUTCDate()).padStart(2, "0"),
  ].join("-");

  // Pedidos de hoje para preencher valor_credito automaticamente
  const { data: pedidosHoje } = await supabase
    .from("pedidos")
    .select("total")
    .eq("cantina_id", CANTINA_ID)
    .eq("status", "confirmado")
    .gte("criado_em", startToday.toISOString())
    .lt("criado_em", startTomorrow.toISOString());

  const creditoHoje = (pedidosHoje ?? []).reduce(
    (s: number, p: any) => s + (p.total ?? 0),
    0
  );

  // Últimos 6 meses de fechamentos para gráficos e histórico
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [fechamentosRes, movimentacoesRes] = await Promise.all([
    supabase
      .from("fechamentos_diarios")
      .select("id, data, valor_dinheiro, valor_cartao, valor_pix, valor_credito, total")
      .eq("cantina_id", CANTINA_ID)
      .gte("data", sixMonthsAgo.toISOString().split("T")[0])
      .order("data", { ascending: false }),

    (supabase as any)
      .from("movimentacoes_caixa")
      .select("id, data, tipo, valor, descricao, saldo_apos, criado_em")
      .eq("cantina_id", CANTINA_ID)
      .order("criado_em", { ascending: false })
      .limit(100),
  ]);

  const movimentacoes = movimentacoesRes.data ?? [];
  // saldo_apos da movimentação mais recente = saldo atual
  const saldoCaixa: number = movimentacoes[0]?.saldo_apos ?? 0;

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Financeiro</h1>
        <p className="text-sm text-gray-500 mt-1">Fechamento diário, caixa e análise de receitas</p>
      </div>
      <FinanceiroView
        creditoHoje={creditoHoje}
        dataHoje={dataHoje}
        fechamentos={(fechamentosRes.data as any) ?? []}
        cantinaId={CANTINA_ID}
        saldoCaixa={saldoCaixa}
        movimentacoesCaixa={movimentacoes}
      />
    </AppLayout>
  );
}
