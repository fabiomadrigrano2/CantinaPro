import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import FornecedoresList from "@/components/fornecedores/FornecedoresList";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDaysBR(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split("T")[0];
}

export default async function FornecedoresPage() {
  const supabase = createClient();

  const hoje = todayBR();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const limiteAlerta = addDaysBR(hoje, 3);

  const [{ data: fornecedores }, { data: comprasMes }, { data: alertas }] = await Promise.all([
    supabase
      .from("fornecedores")
      .select("id, nome, telefone, produtos_fornecidos, frequencia_entrega, observacoes")
      .eq("cantina_id", CANTINA_ID)
      .order("nome"),

    supabase
      .from("compras_fornecedores")
      .select("fornecedor_id, valor")
      .eq("cantina_id", CANTINA_ID)
      .gte("data_entrega", inicioMes)
      .lte("data_entrega", hoje),

    supabase
      .from("compras_fornecedores")
      .select("id, valor, data_vencimento, descricao, fornecedores ( nome )")
      .eq("cantina_id", CANTINA_ID)
      .eq("status_pagamento", "a_pagar")
      .gte("data_vencimento", hoje)
      .lte("data_vencimento", limiteAlerta)
      .order("data_vencimento"),
  ]);

  const totalPorFornecedor: Record<string, number> = {};
  for (const c of comprasMes ?? []) {
    totalPorFornecedor[c.fornecedor_id] = (totalPorFornecedor[c.fornecedor_id] ?? 0) + (c.valor ?? 0);
  }
  const totalGeralMes = Object.values(totalPorFornecedor).reduce((s, v) => s + v, 0);

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Fornecedores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cadastro de fornecedores e controle de compras
        </p>
      </div>
      <FornecedoresList
        initialFornecedores={fornecedores ?? []}
        totalPorFornecedor={totalPorFornecedor}
        totalGeralMes={totalGeralMes}
        alertas={alertas ?? []}
      />
    </AppLayout>
  );
}
