"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DiaVenda } from "@/app/relatorios/page";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: "8px 12px" }}>
      <p style={{ color: "#9ca3af", fontSize: 11, marginBottom: 2 }}>{label}</p>
      <p style={{ color: "#f97316", fontSize: 13, fontWeight: 700 }}>{fmt(payload[0].value)}</p>
    </div>
  );
}

export default function VendasChart({ data }: { data: DiaVenda[] }) {
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">
        Sem vendas neste período
      </div>
    );
  }

  const barSize = data.length <= 7 ? 28 : data.length <= 14 ? 18 : 12;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={barSize}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={data.length > 14 ? Math.floor(data.length / 10) : 0}
        />
        <YAxis
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={58}
          tickFormatter={(v) => `R$${v}`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#2A2A2A" }} />
        <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
