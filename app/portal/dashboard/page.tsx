import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PortalDashboard from "@/components/portal/PortalDashboard";
import { buscarResponsavelPortal } from "@/lib/cantina";

export const dynamic = "force-dynamic";

export type PedidoItemPortal = {
  nome_produto:   string | null;
  quantidade:     number;
  preco_unitario: number;
  produtos:       { nome: string } | null;
};

export type PedidoPortal = {
  id:           string;
  total:        number;
  criado_em:    string;
  itens_pedido: PedidoItemPortal[];
};

export type AlunoPortal = {
  id:           string;
  nome:         string;
  turma:        string | null;
  saldo:        number;
  tipo_conta:   string;
  limite_diario: number;
};

export type WeeklyPoint = { semana: string; total: number };

export type PagamentoPortal = {
  id:         string;
  valor:      number;
  observacao: string | null;
  criado_em:  string;
};

function todayBR() {
  const br = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { year: br.getUTCFullYear(), month: br.getUTCMonth() + 1, day: br.getUTCDate() };
}

function buildWeeklyData(
  pedidos: PedidoPortal[],
  today: { year: number; month: number; day: number },
): WeeklyPoint[] {
  return Array.from({ length: 4 }, (_, i) => {
    const w         = 3 - i;
    const startDate = new Date(Date.UTC(today.year, today.month - 1, today.day - w * 7 - 6, 3, 0, 0));
    const endDate   = new Date(Date.UTC(today.year, today.month - 1, today.day - w * 7 + 1, 3, 0, 0));
    const label     = `${String(startDate.getUTCDate()).padStart(2, "0")}/${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const total     = pedidos
      .filter(p => { const d = new Date(p.criado_em); return d >= startDate && d < endDate; })
      .reduce((s, p) => s + (p.total ?? 0), 0);
    return { semana: label, total };
  });
}

export default async function PortalDashboardPage() {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log("[dashboard] user.id:", user?.id ?? null);
  console.log("[dashboard] user.email:", user?.email ?? null);
  console.log("[dashboard] userError:", userError?.message ?? null);
  if (!user) redirect("/portal/login");

  const admin = createAdminClient();

  // Responsável do usuário logado (admin bypasses RLS). Tudo abaixo filtra
  // pela cantina do próprio responsável.
  const responsavel = await buscarResponsavelPortal(user);
  console.log("[dashboard] responsavel:", responsavel?.id ?? null, "cantina:", responsavel?.cantina_id ?? null);
  if (!responsavel) {
    return <div style={{ padding: "2rem" }}>Conta não encontrada. Contacte a cantina.</div>;
  }
  const CANTINA_ID = responsavel.cantina_id;

  // Step 1: get aluno_id from aluno_responsavel (no join — avoids permission issues on alunos)
  const { data: link, error: linkError } = await admin
    .from("aluno_responsavel")
    .select("aluno_id")
    .eq("responsavel_id", responsavel.id)
    .limit(1)
    .maybeSingle();

  console.log("[dashboard] link (maybeSingle):", JSON.stringify(link), "error:", linkError?.message ?? null);

  const alunoId: string = link?.aluno_id ?? "";
  if (!alunoId) {
    console.log("[dashboard] QUEBROU AQUI — alunoId vazio. responsavel.id:", responsavel.id);
    return <div style={{ padding: "2rem" }}>Nenhum aluno vinculado a esta conta. Contacte a cantina.</div>;
  }

  // Step 2: fetch aluno directly by id
  const { data: alunoRaw, error: alunoError } = await admin
    .from("alunos")
    .select("id, nome, turma, saldo, tipo_conta, limite_diario")
    .eq("id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();

  console.log("[dashboard] aluno:", alunoRaw?.id ?? null, "error:", alunoError?.message ?? null);
  if (!alunoRaw) {
    return <div style={{ padding: "2rem" }}>Aluno não encontrado. Contacte a cantina.</div>;
  }

  const alunoNome: string        = alunoRaw.nome;
  const turmaNome: string | null = (alunoRaw as any).turma ?? null;

  // contas table is the canonical ledger; alunos.saldo is the denormalized fallback
  const { data: conta } = await admin
    .from("contas")
    .select("saldo, tipo")
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();

  // limites_aluno stores limits set via the portal; alunos.limite_diario is the admin fallback
  const { data: limiteData } = await admin
    .from("limites_aluno")
    .select("limite_valor_diario")
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .maybeSingle();

  const aluno: AlunoPortal = {
    id:            alunoId,
    nome:          alunoNome,
    turma:         turmaNome,
    saldo:         conta?.saldo         ?? alunoRaw.saldo         ?? 0,
    tipo_conta:    conta?.tipo          ?? alunoRaw.tipo_conta    ?? "credito",
    limite_diario: limiteData?.limite_valor_diario ?? alunoRaw.limite_diario ?? 0,
  };

  const today    = todayBR();
  // início do mês anterior cobre todos os filtros do histórico (semana, mês atual/anterior, 30 dias)
  const startPrevMonth = new Date(Date.UTC(today.year, today.month - 2, 1, 3, 0, 0));
  const endToday       = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 3, 0, 0));
  const hoje = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

  const { data: pedidos } = await admin
    .from("pedidos")
    .select("id, total, criado_em, itens_pedido(nome_produto, quantidade, preco_unitario, produtos(nome))")
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .eq("status", "confirmado")
    .gte("criado_em", startPrevMonth.toISOString())
    .lt("criado_em", endToday.toISOString())
    .order("criado_em", { ascending: false });

  const pedidosList = (pedidos as PedidoPortal[]) ?? [];

  const { data: pagamentos, error: pagamentosError } = await admin
    .from("pagamentos")
    .select("id, valor, observacao, criado_em")
    .eq("aluno_id", alunoId)
    .eq("cantina_id", CANTINA_ID)
    .eq("status", "confirmado")
    .order("criado_em", { ascending: false })
    .limit(50);
  if (pagamentosError) console.error("[dashboard] pagamentos error:", pagamentosError.message);

  const monthStart = new Date(Date.UTC(today.year, today.month - 1, 1, 3, 0, 0));
  const totalMes   = pedidosList
    .filter(p => new Date(p.criado_em) >= monthStart)
    .reduce((s, p) => s + (p.total ?? 0), 0);

  const weeklyData = buildWeeklyData(pedidosList, today);

  return (
    <PortalDashboard
      aluno={aluno}
      pedidos={pedidosList}
      totalMes={totalMes}
      weeklyData={weeklyData}
      hoje={hoje}
      responsavelNome={responsavel.nome?.trim() || null}
      pagamentos={(pagamentos as PagamentoPortal[]) ?? []}
    />
  );
}
