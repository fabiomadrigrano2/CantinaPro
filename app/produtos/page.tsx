import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import ProdutosList from "@/components/produtos/ProdutosList";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

export default async function ProdutosPage() {
  const supabase = createClient();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, emoji, nome, preco, estoque, estoque_minimo, disponivel, categoria, foto_url")
    .eq("cantina_id", CANTINA_ID)
    .order("nome");

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Produtos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie o cardápio e os estoques da cantina
        </p>
      </div>
      <ProdutosList initialProdutos={(produtos as any) ?? []} />
    </AppLayout>
  );
}
