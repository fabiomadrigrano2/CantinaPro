import NovaVenda from "@/components/vendas/NovaVenda";
import { requireCantinaId } from "@/lib/cantina";

export default async function NovaVendaPage() {
  const cantinaId = await requireCantinaId();
  return <NovaVenda cantinaId={cantinaId} />;
}
