"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import CaixaSection, { type Movimentacao } from "./CaixaSection";

// ── tipos ─────────────────────────────────────────────────────────────────────

type Fechamento = {
  id: string;
  data: string;
  valor_dinheiro: number;
  valor_cartao: number;
  valor_pix: number;
  valor_credito: number;
  total: number;
  despesas: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
};

const fmtShort = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function groupByWeek(fechamentos: Fechamento[]) {
  const weeks: Record<string, { semana: string; vendas: number; despesas: number; lucro: number }> = {};
  for (const f of fechamentos) {
    const [y, m, d] = f.data.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dow = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
    const key = monday.toISOString().split("T")[0];
    const label = `${String(monday.getDate()).padStart(2,"0")}/${String(monday.getMonth()+1).padStart(2,"0")}`;
    if (!weeks[key]) weeks[key] = { semana: label, vendas: 0, despesas: 0, lucro: 0 };
    weeks[key].vendas    += f.total;
    weeks[key].despesas  += f.despesas;
    weeks[key].lucro     += f.total - f.despesas;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([, v]) => v);
}

function groupByMonth(fechamentos: Fechamento[]) {
  const months: Record<string, { mes: string; vendas: number; despesas: number; lucro: number }> = {};
  for (const f of fechamentos) {
    const [y, m] = f.data.split("-").map(Number);
    const key = `${y}-${String(m).padStart(2,"0")}`;
    const label = `${MONTH_NAMES[m-1]}/${String(y).slice(-2)}`;
    if (!months[key]) months[key] = { mes: label, vendas: 0, despesas: 0, lucro: 0 };
    months[key].vendas   += f.total;
    months[key].despesas += f.despesas;
    months[key].lucro    += f.total - f.despesas;
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => v);
}

function getLucroAcumulado(fechamentos: Fechamento[], dataHoje: string, periodo: "semana" | "mes"): number {
  if (periodo === "semana") {
    const [y, m, d] = dataHoje.split("-").map(Number);
    const today = new Date(y, m - 1, d);
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const mondayStr = monday.toISOString().split("T")[0];
    return fechamentos
      .filter(f => f.data >= mondayStr && f.data <= dataHoje)
      .reduce((s, f) => s + (f.total - f.despesas), 0);
  }
  const mesStr = dataHoje.slice(0, 7);
  return fechamentos
    .filter(f => f.data.startsWith(mesStr))
    .reduce((s, f) => s + (f.total - f.despesas), 0);
}

// ── tooltips ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao:   "Cartão",
  pix:      "Pix",
  credito:  "Créditos",
};

const TYPE_COLORS: Record<string, string> = {
  dinheiro: "#22c55e",
  cartao:   "#3b82f6",
  pix:      "#a855f7",
  credito:  "#f97316",
};

function StackedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", borderRadius:10, padding:"8px 12px" }}>
      <p style={{ color:"#9ca3af", fontSize:11, marginBottom:4 }}>{label}</p>
      {[...payload].reverse().map((p: any) => (
        <p key={p.dataKey} style={{ color:p.fill, fontSize:12, margin:"1px 0" }}>
          {TYPE_LABELS[p.dataKey]}: {fmt(p.value)}
        </p>
      ))}
      <p style={{ color:"#fff", fontSize:13, fontWeight:700, marginTop:4, borderTop:"1px solid #2A2A2A", paddingTop:4 }}>
        Total: {fmt(total)}
      </p>
    </div>
  );
}

function LucroTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const map: Record<string, number> = {};
  for (const p of payload) map[p.dataKey] = p.value ?? 0;
  return (
    <div style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", borderRadius:10, padding:"8px 12px" }}>
      <p style={{ color:"#9ca3af", fontSize:11, marginBottom:4 }}>{label}</p>
      {map.vendas   !== undefined && <p style={{ color:"#f97316", fontSize:12, margin:"1px 0" }}>Vendas: {fmt(map.vendas)}</p>}
      {map.despesas !== undefined && <p style={{ color:"#ef4444", fontSize:12, margin:"1px 0" }}>Despesas: {fmt(map.despesas)}</p>}
      {map.lucro    !== undefined && (
        <p style={{ color: map.lucro >= 0 ? "#10b981" : "#ef4444", fontSize:13, fontWeight:700, marginTop:4, borderTop:"1px solid #2A2A2A", paddingTop:4 }}>
          Lucro: {fmt(map.lucro)}
        </p>
      )}
    </div>
  );
}

// ── card wrapper ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-gray-500";
  return (
    <div className="bg-cp-surface border border-cp-border rounded-2xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{fmt(value)}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[180px] text-gray-600 text-sm">
      Sem dados para exibir ainda
    </div>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

export default function FinanceiroView({
  creditoHoje,
  dataHoje,
  fechamentos,
  cantinaId,
  saldoCaixa,
  movimentacoesCaixa,
  totalFornecedoresHoje,
  totalFornecedoresMes,
}: {
  creditoHoje: number;
  dataHoje: string;
  fechamentos: Fechamento[];
  cantinaId: string;
  saldoCaixa: number;
  movimentacoesCaixa: Movimentacao[];
  totalFornecedoresHoje: number;
  totalFornecedoresMes: number;
}) {
  const router = useRouter();

  const todayFechamento = fechamentos.find((f) => f.data === dataHoje);
  const [form, setForm] = useState({
    dinheiro: String(todayFechamento?.valor_dinheiro ?? 0),
    cartao:   String(todayFechamento?.valor_cartao   ?? 0),
    pix:      String(todayFechamento?.valor_pix      ?? 0),
    despesas: String(todayFechamento?.despesas       ?? 0),
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dinheiro = parseFloat(form.dinheiro) || 0;
  const cartao   = parseFloat(form.cartao)   || 0;
  const pix      = parseFloat(form.pix)      || 0;
  const despesas = parseFloat(form.despesas) || 0;
  const total    = dinheiro + cartao + pix + creditoHoje;
  const lucroHoje = total - despesas;

  // Fechamentos virtuais: substitui entrada de hoje pelos valores atuais do form
  // para que os KPIs mostrem preview em tempo real antes de salvar
  const fechamentosVirtual = useMemo((): Fechamento[] => {
    const semHoje = fechamentos.filter(f => f.data !== dataHoje);
    return [
      ...semHoje,
      {
        id: "__preview__",
        data: dataHoje,
        valor_dinheiro: dinheiro,
        valor_cartao: cartao,
        valor_pix: pix,
        valor_credito: creditoHoje,
        total,
        despesas,
      },
    ];
  }, [fechamentos, dataHoje, dinheiro, cartao, pix, creditoHoje, total, despesas]);

  const lucroSemanal = useMemo(
    () => getLucroAcumulado(fechamentosVirtual, dataHoje, "semana"),
    [fechamentosVirtual, dataHoje]
  );
  const lucroMensal = useMemo(
    () => getLucroAcumulado(fechamentosVirtual, dataHoje, "mes"),
    [fechamentosVirtual, dataHoje]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient() as any;
    const { error: err } = await supabase
      .from("fechamentos_diarios")
      .upsert(
        {
          cantina_id:     cantinaId,
          data:           dataHoje,
          valor_dinheiro: dinheiro,
          valor_cartao:   cartao,
          valor_pix:      pix,
          valor_credito:  creditoHoje,
          total,
          despesas,
        },
        { onConflict: "cantina_id,data" }
      );

    if (err) { setError(err.message); setSaving(false); return; }

    // Auto-registra entrada no caixa para o dinheiro do fechamento
    if (dinheiro > 0) {
      const descricaoCaixa = `Vendas em dinheiro — ${fmtDate(dataHoje)}`;

      const [{ data: existing }, { data: todasMovs }] = await Promise.all([
        supabase
          .from("movimentacoes_caixa")
          .select("id, valor, saldo_apos")
          .eq("cantina_id", cantinaId)
          .eq("descricao", descricaoCaixa)
          .maybeSingle(),
        supabase
          .from("movimentacoes_caixa")
          .select("tipo, valor")
          .eq("cantina_id", cantinaId),
      ]);

      const saldoAtual = (todasMovs ?? []).reduce(
        (acc: number, m: any) => acc + (m.tipo === "saida" ? -m.valor : m.valor),
        0
      );

      if (!existing) {
        await supabase.from("movimentacoes_caixa").insert({
          cantina_id: cantinaId,
          data:       new Date().toISOString(),
          tipo:       "entrada",
          valor:      dinheiro,
          descricao:  descricaoCaixa,
          saldo_apos: saldoAtual + dinheiro,
        });
      } else if ((existing as any).valor !== dinheiro) {
        const delta = dinheiro - (existing as any).valor;
        await supabase
          .from("movimentacoes_caixa")
          .update({ valor: dinheiro, saldo_apos: (existing as any).saldo_apos + delta })
          .eq("id", (existing as any).id);
      }
    }

    setSaving(false);
    setSuccess(true);
    router.refresh();
  }

  // ── dados dos gráficos ──────────────────────────────────────────────────────

  const dailyPaymentData = useMemo(() =>
    fechamentos.slice(0, 14).reverse().map((f) => ({
      dia:      fmtShort(f.data),
      dinheiro: f.valor_dinheiro,
      cartao:   f.valor_cartao,
      pix:      f.valor_pix,
      credito:  f.valor_credito,
    })),
    [fechamentos]
  );

  const dailyResultData = useMemo(() =>
    fechamentos.slice(0, 14).reverse().map((f) => ({
      dia:      fmtShort(f.data),
      vendas:   f.total,
      despesas: f.despesas,
      lucro:    f.total - f.despesas,
    })),
    [fechamentos]
  );

  const weeklyData  = useMemo(() => groupByWeek(fechamentos),  [fechamentos]);
  const monthlyData = useMemo(() => groupByMonth(fechamentos), [fechamentos]);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Caixa ────────────────────────────────────────────────────────────── */}
      <CaixaSection
        saldoCaixa={saldoCaixa}
        movimentacoes={movimentacoesCaixa}
        cantinaId={cantinaId}
      />

      {/* ── Formulário de fechamento ─────────────────────────────────────────── */}
      <Card title={`Fechamento de hoje — ${fmtDate(dataHoje)}`}>
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

            {/* Dinheiro */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Dinheiro (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.dinheiro}
                  onChange={(e) => setForm((f) => ({ ...f, dinheiro: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Cartão */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Cartão (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.cartao}
                  onChange={(e) => setForm((f) => ({ ...f, cartao: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Pix */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Pix (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.pix}
                  onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Créditos — automático */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Créditos / Marcações
                <span className="ml-1.5 text-[10px] text-orange-400 font-normal">automático</span>
              </label>
              <div className="flex items-center px-4 py-2.5 bg-cp-bg border border-cp-border rounded-xl">
                <span className="text-sm font-semibold text-orange-400 tabular-nums">{fmt(creditoHoje)}</span>
                <span className="ml-2 text-xs text-gray-600">do sistema de hoje</span>
              </div>
            </div>

            {/* Despesas do dia */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Despesas do dia (R$)
                <span className="ml-1.5 text-[10px] text-gray-600 font-normal">ingredientes, embalagens, etc.</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.despesas}
                  onChange={(e) => setForm((f) => ({ ...f, despesas: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 bg-cp-elevated border border-cp-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Resumo: Vendas / Despesas / Lucro */}
          <div className="rounded-xl border border-cp-border overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-cp-border">
              <span className="text-sm text-gray-400">Total de vendas</span>
              <span className="text-base font-semibold text-orange-400 tabular-nums">{fmt(total)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-cp-border">
              <span className="text-sm text-gray-400">Despesas</span>
              <span className="text-base font-semibold text-red-400 tabular-nums">− {fmt(despesas)}</span>
            </div>
            <div className={`flex items-center justify-between px-4 py-3 ${lucroHoje >= 0 ? "bg-emerald-500/5" : "bg-red-500/5"}`}>
              <span className="text-sm font-semibold text-gray-300">Lucro do dia</span>
              <span className={`text-xl font-bold tabular-nums ${lucroHoje >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmt(lucroHoje)}
              </span>
            </div>
          </div>

          {error   && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {success && <p className="text-sm text-emerald-400 mb-3">Fechamento salvo com sucesso!</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
          >
            {saving ? "Salvando…" : todayFechamento ? "Atualizar fechamento" : "Salvar fechamento"}
          </button>
        </form>
      </Card>

      {/* ── KPIs de lucro acumulado ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Lucro hoje"
          value={lucroHoje}
          sub="vendas − despesas de hoje"
        />
        <KpiCard
          label="Lucro esta semana"
          value={lucroSemanal}
          sub="acumulado desde segunda-feira"
        />
        <KpiCard
          label="Lucro este mês"
          value={lucroMensal}
          sub={`acumulado em ${MONTH_NAMES[parseInt(dataHoje.split("-")[1]) - 1]}`}
        />
      </div>

      {/* ── Gráfico: Vendas por tipo ──────────────────────────────────────────── */}
      <Card title="Vendas por tipo de pagamento — últimos 14 dias">
        {dailyPaymentData.length === 0 ? (
          <EmptyChart />
        ) : (
          <>
            <div className="flex flex-wrap gap-4 mb-3">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: TYPE_COLORS[key] }} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyPaymentData} margin={{ top:4, right:4, left:0, bottom:0 }} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<StackedTooltip />} cursor={{ fill:"#2A2A2A" }} />
                <Bar dataKey="dinheiro" stackId="a" fill={TYPE_COLORS.dinheiro} />
                <Bar dataKey="cartao"   stackId="a" fill={TYPE_COLORS.cartao}   />
                <Bar dataKey="pix"      stackId="a" fill={TYPE_COLORS.pix}      />
                <Bar dataKey="credito"  stackId="a" fill={TYPE_COLORS.credito}  radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* ── Gráfico: Resultado diário ─────────────────────────────────────────── */}
      <Card title="Resultado diário — últimos 14 dias">
        {dailyResultData.length === 0 ? (
          <EmptyChart />
        ) : (
          <>
            <div className="flex flex-wrap gap-4 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-orange-500" />
                <span className="text-xs text-gray-500">Vendas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-red-500" />
                <span className="text-xs text-gray-500">Despesas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-emerald-500" />
                <span className="text-xs text-gray-500">Lucro</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyResultData} margin={{ top:4, right:4, left:0, bottom:0 }} barSize={12} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<LucroTooltip />} cursor={{ fill:"#2A2A2A" }} />
                <Bar dataKey="vendas"   fill="#f97316" radius={[4,4,0,0]} />
                <Bar dataKey="despesas" fill="#ef4444" radius={[4,4,0,0]} />
                <Bar dataKey="lucro"    fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Fechamento semanal */}
        <Card title="Resultado semanal">
          {weeklyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-3">
                {[["vendas","#f97316","Vendas"],["despesas","#ef4444","Despesas"],["lucro","#10b981","Lucro"]].map(([k,c,l]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c }} />
                    <span className="text-xs text-gray-500">{l}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} margin={{ top:4, right:4, left:0, bottom:0 }} barSize={10} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip content={<LucroTooltip />} cursor={{ fill:"#2A2A2A" }} />
                  <Bar dataKey="vendas"   fill="#f97316" radius={[4,4,0,0]} />
                  <Bar dataKey="despesas" fill="#ef4444" radius={[4,4,0,0]} />
                  <Bar dataKey="lucro"    fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        {/* Fechamento mensal */}
        <Card title="Resultado mensal">
          {monthlyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-3">
                {[["vendas","#f97316","Vendas"],["despesas","#ef4444","Despesas"],["lucro","#10b981","Lucro"]].map(([k,c,l]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c }} />
                    <span className="text-xs text-gray-500">{l}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top:4, right:4, left:0, bottom:0 }} barSize={14} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip content={<LucroTooltip />} cursor={{ fill:"#2A2A2A" }} />
                  <Bar dataKey="vendas"   fill="#f97316" radius={[4,4,0,0]} />
                  <Bar dataKey="despesas" fill="#ef4444" radius={[4,4,0,0]} />
                  <Bar dataKey="lucro"    fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>
      </div>

      {/* ── Fornecedores ─────────────────────────────────────────────────────── */}
      <Card title="Fornecedores">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border border-cp-border px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Pago hoje</p>
            <p className="text-lg font-bold text-red-400 tabular-nums">
              {totalFornecedoresHoje > 0 ? `− ${fmt(totalFornecedoresHoje)}` : fmt(0)}
            </p>
          </div>
          <div className="rounded-xl border border-cp-border px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Pago este mês</p>
            <p className="text-lg font-bold text-red-400 tabular-nums">
              {totalFornecedoresMes > 0 ? `− ${fmt(totalFornecedoresMes)}` : fmt(0)}
            </p>
          </div>
        </div>
        <Link
          href="/fornecedores"
          className="text-sm text-orange-400 hover:text-orange-300 font-medium transition"
        >
          Ver fornecedores →
        </Link>
      </Card>

      {/* ── Histórico ────────────────────────────────────────────────────────── */}
      <Card title="Histórico de fechamentos">
        {fechamentos.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">Nenhum fechamento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-cp-border">
                  <th className="text-left pb-3 pr-4">Data</th>
                  <th className="text-right pb-3 px-4">Dinheiro</th>
                  <th className="text-right pb-3 px-4">Cartão</th>
                  <th className="text-right pb-3 px-4">Pix</th>
                  <th className="text-right pb-3 px-4">Créditos</th>
                  <th className="text-right pb-3 px-4">Vendas</th>
                  <th className="text-right pb-3 px-4">Despesas</th>
                  <th className="text-right pb-3 pl-4">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cp-border">
                {fechamentos.map((f) => {
                  const lucro = f.total - f.despesas;
                  return (
                    <tr key={f.id} className={`hover:bg-cp-elevated transition-colors ${f.data === dataHoje ? "bg-orange-500/5" : ""}`}>
                      <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">
                        {fmtDate(f.data)}
                        {f.data === dataHoje && (
                          <span className="ml-2 text-[10px] text-orange-400 font-semibold">hoje</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-300">{fmt(f.valor_dinheiro)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-300">{fmt(f.valor_cartao)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-300">{fmt(f.valor_pix)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-300">{fmt(f.valor_credito)}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-orange-400">{fmt(f.total)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-red-400">{f.despesas > 0 ? `− ${fmt(f.despesas)}` : "—"}</td>
                      <td className={`py-3 pl-4 text-right tabular-nums font-semibold ${lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(lucro)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
