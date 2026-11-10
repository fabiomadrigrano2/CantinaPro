import type { PagamentoExtrato, PedidoExtrato } from "@/app/cobrancas/actions";
import { diaBR } from "@/lib/dataBR";

// Linha do tempo do extrato, compartilhada pelo texto do WhatsApp, pela ficha
// do aluno e pelo PDF: consumo agrupado por dia e pagamentos, em ordem
// cronológica.

export type ItemDia = { nome: string; quantidade: number; valor: number | null };

export type EventoExtrato =
  | { tipo: "consumo"; dia: string; quando: string; total: number; itens: ItemDia[] }
  | { tipo: "pagamento"; dia: string; quando: string; valor: number; forma: string | null };

export function linhaDoTempo(pedidos: PedidoExtrato[], pagamentos: PagamentoExtrato[]): EventoExtrato[] {
  const dias = new Map<string, { quando: string; total: number; itens: Map<string, ItemDia> }>();

  for (const p of pedidos) {
    const dia = diaBR(p.criado_em);
    let d = dias.get(dia);
    if (!d) {
      d = { quando: p.criado_em, total: 0, itens: new Map() };
      dias.set(dia, d);
    }
    if (p.criado_em < d.quando) d.quando = p.criado_em;
    d.total += p.total;

    // Soma itens repetidos no mesmo dia (mesmo produto e preço)
    for (const i of p.itens) {
      const chave = `${i.nome_produto}|${i.preco_unitario ?? ""}`;
      const atual = d.itens.get(chave);
      const valor = i.preco_unitario != null ? i.quantidade * i.preco_unitario : null;
      if (atual) {
        atual.quantidade += i.quantidade;
        atual.valor = atual.valor != null && valor != null ? atual.valor + valor : null;
      } else {
        d.itens.set(chave, { nome: i.nome_produto, quantidade: i.quantidade, valor });
      }
    }
  }

  const eventos: EventoExtrato[] = [
    ...Array.from(dias, ([dia, d]) => ({
      tipo: "consumo" as const,
      dia,
      quando: d.quando,
      total: d.total,
      itens: Array.from(d.itens.values()),
    })),
    ...pagamentos.map((p) => ({
      tipo: "pagamento" as const,
      dia: diaBR(p.criado_em),
      quando: p.criado_em,
      valor: p.valor,
      forma: p.forma_pagamento,
    })),
  ];

  // Por dia; dentro do dia, pela hora (consumo conta pelo primeiro pedido)
  return eventos.sort((a, b) =>
    a.dia.localeCompare(b.dia) || Date.parse(a.quando) - Date.parse(b.quando)
  );
}

export function totaisExtrato(pedidos: PedidoExtrato[], pagamentos: PagamentoExtrato[]) {
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    consumido: arred(pedidos.reduce((s, p) => s + p.total, 0)),
    pago:      arred(pagamentos.reduce((s, p) => s + p.valor, 0)),
  };
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const ROTULO_SALDO_ATUAL = "Saldo atual da conta (hoje)";

// Saldo da conta (negativo = em aberto) em texto: "R$ 45,00 em aberto"
export function descreverSaldo(saldo: number): string {
  if (saldo < -0.004) return `${fmt(Math.abs(saldo))} em aberto`;
  if (saldo > 0.004) return `${fmt(saldo)} de crédito`;
  return fmt(0);
}

const FORMAS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  credito: "Crédito",
};

export function rotuloPagamento(forma: string | null): string {
  const f = forma?.trim().toLowerCase();
  if (!f) return "Pagamento";
  return `Pagamento (${FORMAS[f] ?? f.charAt(0).toUpperCase() + f.slice(1)})`;
}
