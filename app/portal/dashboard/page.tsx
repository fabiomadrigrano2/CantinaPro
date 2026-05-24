import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PortalDashboard from "@/components/portal/PortalDashboard";

const CANTINA_ID = "c7301d8b-890b-4775-986e-bb88979326f3";

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
  console.log("[dashboard] getUser:", user?.email ?? null, "error:", userError?.message ?? null);
  if (!user) redirect("/portal/login");

  const admin = createAdminClient();

  // Find responsavel by email (admin bypasses RLS)
  const { data: responsavel, error: respError } = await admin
    .from("responsaveis")
    .select("id")
    .ilike("email", user.email!)
    .eq("cantina_id", CANTINA_ID)
    .limit(1)
    .maybeSingle();

  console.log("[dashboard] responsavel:", responsavel?.id ?? null, "error:", respError?.message ?? null);
  if (!responsavel) redirect("/portal/login");

  // Find first linked aluno — includes saldo/tipo_conta/limite_diario stored on alunos
  console.log("[dashboard] buscando aluno_responsavel com responsavel_id:", responsavel.id);

  const { data: link, error: linkError } = await admin
    .from("aluno_responsavel")
    .select("aluno_id, alunos(id, nome, turma_id, saldo, tipo_conta, limite_diario, turmas(nome))")
    .eq("responsavel_id", responsavel.id)
    .limit(1)
    .maybeSingle();

  // fallback: tenta buscar pelo user_id do Auth caso o vínculo use esse campo
  let linkFinal = link;
  if (!link && !linkError) {
    console.log("[dashboard] sem resultado por responsavel.id, tentando por user_id do auth:", user.id);
    const { data: linkByUserId, error: linkByUserIdError } = await admin
      .from("aluno_responsavel")
      .select("aluno_id, alunos(id, nome, turma_id, saldo, tipo_conta, limite_diario, turmas(nome))")
      .eq("responsavel_id", user.id)
      .limit(1)
      .maybeSingle();
    console.log("[dashboard] fallback user_id → aluno_id:", linkByUserId?.aluno_id ?? null, "error:", linkByUserIdError?.message ?? null);
    linkFinal = linkByUserId;
  }

  const alunoRaw = (linkFinal as any)?.alunos;
  console.log("[dashboard] link aluno_responsavel:", linkFinal?.aluno_id ?? null, "linkError:", linkError?.message ?? null, "alunoRaw:", alunoRaw?.id ?? null);
  if (!alunoRaw) redirect("/portal/login");

  const alunoId: string          = alunoRaw.id;
  const alunoNome: string        = alunoRaw.nome;
  const turmaNome: string | null = alunoRaw.turmas?.nome ?? null;

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
  const start30  = new Date(Date.UTC(today.year, today.month - 1, today.day - 29, 3, 0, 0));
  const endToday = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 3, 0, 0));

  const { data: pedidos } = await admin
    .from("pedidos")
    .select("id, total, criado_em, itens_pedido(nome_produto, quantidade, preco_unitario, produtos(nome))")
    .eq("aluno_id", alunoId)
    .eq("status", "confirmado")
    .gte("criado_em", start30.toISOString())
    .lt("criado_em", endToday.toISOString())
    .order("criado_em", { ascending: false });

  const pedidosList = (pedidos as PedidoPortal[]) ?? [];

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
    />
  );
}
