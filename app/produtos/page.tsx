import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/components/layout/AppLayout";
import ProdutosList from "@/components/produtos/ProdutosList";
import { requireCantinaId } from "@/lib/cantina";

export default async function ProdutosPage() {
  const CANTINA_ID = await requireCantinaId();
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
          Gerencie os produtos e o cardápio da cantina
        </p>
      </div>
      <ProdutosList initialProdutos={(produtos as any) ?? []} cantinaId={CANTINA_ID} />
    </AppLayout>
  );
}
