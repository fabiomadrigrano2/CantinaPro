import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import FornecedorDetail from "@/components/fornecedores/FornecedorDetail";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default async function FornecedorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: fornecedor } = await supabase
    .from("fornecedores")
    .select("id, nome, telefone, produtos_fornecidos, frequencia_entrega, observacoes")
    .eq("id", params.id)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();

  if (!fornecedor) notFound();

  const { data: compras } = await supabase
    .from("compras_fornecedores")
    .select("id, data_entrega, descricao, valor, status_pagamento, data_vencimento")
    .eq("fornecedor_id", params.id)
    .eq("cantina_id", CANTINA_ID)
    .order("data_entrega", { ascending: false });

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, emoji, estoque")
    .eq("cantina_id", CANTINA_ID)
    .eq("disponivel", true)
    .order("nome");

  const hoje = todayBR();
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const totalMes = (compras ?? [])
    .filter((c) => c.data_entrega >= inicioMes && c.data_entrega <= hoje)
    .reduce((s, c) => s + (c.valor ?? 0), 0);

  const totalAberto = (compras ?? [])
    .filter((c) => c.status_pagamento === "a_pagar")
    .reduce((s, c) => s + (c.valor ?? 0), 0);

  return (
    <AppLayout>
      <FornecedorDetail
        fornecedor={fornecedor}
        compras={compras ?? []}
        produtos={produtos ?? []}
        totalMes={totalMes}
        totalAberto={totalAberto}
        hoje={hoje}
      />
    </AppLayout>
  );
}
