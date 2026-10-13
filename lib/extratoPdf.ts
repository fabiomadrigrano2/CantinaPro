import type { PedidoExtrato } from "@/app/cobrancas/actions";

// Gera e baixa o PDF do extrato de consumo de um aluno. Roda no navegador;
// o jsPDF é carregado só no clique para não pesar o bundle da tela.
// Fontes padrão do PDF (Helvetica/WinAnsi) cobrem acentos e "—", mas não emoji.

const CABECALHO = "CantinaPro — Cantina do Fabio | Colégio Nobilis";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Mesma premissa do Extrato: BR = UTC-3 fixo
function toBRDateStr(iso: string): string {
  const br = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, "0")}-${String(br.getUTCDate()).padStart(2, "0")}`;
}

function dataBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function diaSemana(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function slug(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type ItemDia = { nome: string; quantidade: number; valor: number | null };

function agruparPorDia(pedidos: PedidoExtrato[]) {
  const dias: Record<string, { total: number; itens: Map<string, ItemDia> }> = {};

  for (const p of pedidos) {
    const dia = toBRDateStr(p.criado_em);
    dias[dia] ??= { total: 0, itens: new Map() };
    dias[dia].total += p.total;

    // Soma itens repetidos no mesmo dia (mesmo produto e preço)
    for (const i of p.itens) {
      const chave = `${i.nome_produto}|${i.preco_unitario ?? ""}`;
      const atual = dias[dia].itens.get(chave);
      const valor = i.preco_unitario != null ? i.quantidade * i.preco_unitario : null;
      if (atual) {
        atual.quantidade += i.quantidade;
        atual.valor = atual.valor != null && valor != null ? atual.valor + valor : null;
      } else {
        dias[dia].itens.set(chave, { nome: i.nome_produto, quantidade: i.quantidade, valor });
      }
    }
  }

  return Object.keys(dias).sort().map((dia) => ({
    dia,
    total: dias[dia].total,
    itens: Array.from(dias[dia].itens.values()),
  }));
}

export async function gerarExtratoPdf({
  nomeAluno,
  turma,
  periodoLabel,
  inicio,
  fim,
  pedidos,
}: {
  nomeAluno: string;
  turma: string | null;
  periodoLabel: string;
  inicio: string;
  fim: string;
  pedidos: PedidoExtrato[];
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;                 // margem lateral
  const RODAPE = H - 14;        // linha do rodapé
  const LIMITE = RODAPE - 8;    // última linha útil de conteúdo

  const LARANJA: [number, number, number] = [249, 115, 22];
  const ESCURO:  [number, number, number] = [17, 24, 39];
  const CINZA:   [number, number, number] = [107, 114, 128];
  const CLARO:   [number, number, number] = [243, 244, 246];

  let y = 0;

  function cabecalho() {
    doc.setFillColor(...LARANJA);
    doc.rect(0, 0, W, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...ESCURO);
    doc.text(CABECALHO, M, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text("Extrato de consumo", M, 21);
    doc.setDrawColor(229, 231, 235);
    doc.line(M, 25, W - M, 25);
    y = 33;
  }

  function novaPaginaSePreciso(altura: number) {
    if (y + altura <= LIMITE) return;
    doc.addPage();
    cabecalho();
  }

  cabecalho();

  // ── aluno e período ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...ESCURO);
  doc.text(nomeAluno, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  doc.text(turma ? `Turma ${turma}` : "Sem turma", M, y);
  y += 8;

  doc.setFillColor(...CLARO);
  doc.roundedRect(M, y - 5, W - 2 * M, 12, 2, 2, "F");
  doc.setFontSize(9);
  doc.text("PERÍODO", M + 4, y + 2.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ESCURO);
  doc.text(`${periodoLabel}  ·  ${dataBR(inicio)} a ${dataBR(fim)}`, M + 24, y + 2.5);
  y += 16;

  // ── detalhamento por dia ──
  const dias = agruparPorDia(pedidos);
  const total = pedidos.reduce((s, p) => s + p.total, 0);

  if (dias.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA);
    doc.text("Nenhum consumo registrado neste período.", M, y);
    y += 10;
  }

  for (const { dia, total: totalDia, itens } of dias) {
    const tituloDia = (continuacao: boolean) => {
      doc.setFillColor(...CLARO);
      doc.rect(M, y - 4.5, W - 2 * M, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ESCURO);
      doc.text(`${diaSemana(dia)}, ${dataBR(dia)}${continuacao ? " (continuação)" : ""}`, M + 3, y);
      if (!continuacao) doc.text(fmt(totalDia), W - M - 3, y, { align: "right" });
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
    };

    // mantém o título do dia junto com pelo menos um item
    novaPaginaSePreciso(8 + 6);
    tituloDia(false);

    for (const item of itens) {
      // dia quebrado entre páginas: repete o título no topo da nova página
      if (y + 6 > LIMITE) {
        novaPaginaSePreciso(6);
        tituloDia(true);
      }
      const nome = doc.splitTextToSize(item.nome, W - 2 * M - 60)[0] as string;
      doc.setTextColor(55, 65, 81);
      doc.text(nome, M + 6, y);
      doc.setTextColor(...CINZA);
      doc.text(`x${item.quantidade}`, W - M - 40, y, { align: "right" });
      doc.setTextColor(55, 65, 81);
      doc.text(item.valor != null ? fmt(item.valor) : "—", W - M - 3, y, { align: "right" });
      y += 5.5;
    }
    y += 3;
  }

  // ── total em destaque ──
  novaPaginaSePreciso(18);
  y += 2;
  doc.setFillColor(...LARANJA);
  doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL DO PERÍODO", M + 5, y + 9);
  doc.setFontSize(14);
  doc.text(fmt(total), W - M - 5, y + 9.2, { align: "right" });

  // ── rodapé em todas as páginas ──
  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(229, 231, 235);
    doc.line(M, RODAPE - 4, W - M, RODAPE - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text(`Gerado em ${geradoEm.replace(",", " às")}`, M, RODAPE);
    doc.text(`Página ${p} de ${paginas}`, W - M, RODAPE, { align: "right" });
  }

  return doc;
}

export async function baixarExtratoPdf(params: Parameters<typeof gerarExtratoPdf>[0]): Promise<void> {
  const doc = await gerarExtratoPdf(params);
  doc.save(`extrato-${slug(params.nomeAluno)}-${params.inicio}-a-${params.fim}.pdf`);
}
