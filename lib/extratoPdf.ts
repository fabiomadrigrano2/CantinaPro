import type { ExtratoAluno } from "@/app/cobrancas/actions";
import { cabecalhoCantina, type CantinaInfo } from "@/lib/cantinaInfo";
import {
  ROTULO_SALDO_ATUAL, descreverSaldo, linhaDoTempo, rotuloPagamento, totaisExtrato,
} from "@/lib/extrato";

// Gera e baixa o PDF do extrato de consumo de um aluno. Roda no navegador;
// o jsPDF é carregado só no clique para não pesar o bundle da tela.
// Fontes padrão do PDF (Helvetica/WinAnsi) cobrem acentos e "—", mas não emoji.

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

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

export async function gerarExtratoPdf({
  cantina,
  nomeAluno,
  turma,
  periodoLabel,
  inicio,
  fim,
  extrato,
}: {
  cantina: CantinaInfo;
  nomeAluno: string;
  turma: string | null;
  periodoLabel: string;
  inicio: string;
  fim: string;
  extrato: ExtratoAluno;
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
  const VERDE:   [number, number, number] = [5, 150, 105];
  const CABECALHO = cabecalhoCantina(cantina);

  let y = 0;

  function cabecalho() {
    doc.setFillColor(...LARANJA);
    doc.rect(0, 0, W, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...ESCURO);
    // nome + escola longos: reduz a fonte (até 9) e, se ainda não couber, corta
    const largura = doc.getTextWidth(CABECALHO);
    if (largura > W - 2 * M) doc.setFontSize(Math.max(9, (13 * (W - 2 * M)) / largura));
    doc.text(doc.splitTextToSize(CABECALHO, W - 2 * M)[0] as string, M, 15);
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

  // ── consumo por dia e pagamentos, em ordem cronológica ──
  const eventos = linhaDoTempo(extrato.pedidos, extrato.pagamentos);
  const { consumido, pago } = totaisExtrato(extrato.pedidos, extrato.pagamentos);

  if (eventos.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA);
    doc.text("Nenhum consumo ou pagamento registrado neste período.", M, y);
    y += 10;
  }

  for (const evento of eventos) {
    if (evento.tipo === "pagamento") {
      novaPaginaSePreciso(8 + 3);
      doc.setFillColor(236, 253, 245);
      doc.rect(M, y - 4.5, W - 2 * M, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...VERDE);
      doc.text(`${diaSemana(evento.dia)}, ${dataBR(evento.dia)} — ${rotuloPagamento(evento.forma)}`, M + 3, y);
      doc.text(fmt(evento.valor), W - M - 3, y, { align: "right" });
      y += 10;
      continue;
    }

    const { dia, total: totalDia, itens } = evento;
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

  // ── resumo: consumido, pago e saldo atual em destaque ──
  novaPaginaSePreciso(18 + 16);
  y += 2;
  doc.setFillColor(...CLARO);
  doc.roundedRect(M, y, W - 2 * M, 16, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ESCURO);
  doc.text("Total consumido no período", M + 5, y + 6);
  doc.text(fmt(consumido), W - M - 5, y + 6, { align: "right" });
  doc.setTextColor(...VERDE);
  doc.text("Total pago no período", M + 5, y + 12);
  doc.text(fmt(pago), W - M - 5, y + 12, { align: "right" });
  y += 18;

  doc.setFillColor(...LARANJA);
  doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(ROTULO_SALDO_ATUAL.toUpperCase(), M + 5, y + 9);
  doc.setFontSize(13);
  doc.text(descreverSaldo(extrato.saldoAtual), W - M - 5, y + 9.2, { align: "right" });

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
