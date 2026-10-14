// Gera e baixa o PDF do "Resumão da Semana" (tela de Cobranças). Mesmo visual
// do extrato em lib/extratoPdf.ts; jsPDF carregado só no clique.
// Fontes padrão do PDF não têm emoji — nada de emoji nos textos daqui.

const CABECALHO = "CantinaPro — Cantina do Fabio | Colégio Nobilis";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function dataBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export type LinhaResumaoSemanal = {
  nome: string;
  turma: string | null;
  valorSemana: number;
  valorAnterior: number;
  total: number;
};

export type LinhaResumaoMensal = {
  nome: string;
  turma: string | null;
  total: number;
  dataCombinada: string; // texto pronto, ex.: "Hoje (dia 14)"
};

export async function baixarResumaoPdf({
  hoje,
  semanaInicio,
  semanaFim,
  semanais,
  mensais,
}: {
  hoje: string;          // YYYY-MM-DD
  semanaInicio: string;  // YYYY-MM-DD
  semanaFim: string;     // YYYY-MM-DD
  semanais: LinhaResumaoSemanal[];
  mensais: LinhaResumaoMensal[];
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const RODAPE = H - 14;
  const LIMITE = RODAPE - 8;

  const LARANJA: [number, number, number] = [249, 115, 22];
  const ESCURO:  [number, number, number] = [17, 24, 39];
  const CINZA:   [number, number, number] = [107, 114, 128];
  const CLARO:   [number, number, number] = [243, 244, 246];
  const TEXTO:   [number, number, number] = [55, 65, 81];

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
    doc.text(`Resumão da Semana  ·  ${dataBR(semanaInicio)} a ${dataBR(semanaFim)}`, M, 21);
    doc.setDrawColor(229, 231, 235);
    doc.line(M, 25, W - M, 25);
    y = 33;
  }

  function novaPaginaSePreciso(altura: number) {
    if (y + altura <= LIMITE) return;
    doc.addPage();
    cabecalho();
  }

  function cortar(texto: string, largura: number): string {
    return doc.splitTextToSize(texto, largura)[0] as string;
  }

  // Colunas: nome+turma à esquerda, valores alinhados à direita
  type Coluna = { titulo: string; x: number };

  function secao(titulo: string, colunas: Coluna[], linhas: { nome: string; turma: string | null; valores: string[] }[], total: number, vazio: string) {
    // turma fica numa faixa fixa antes da primeira coluna de valores
    const xTurma = colunas[0].x - 45;
    const larguraNome = xTurma - M - 6;

    const tituloTabela = () => {
      doc.setFillColor(...CLARO);
      doc.rect(M, y - 4.5, W - 2 * M, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...CINZA);
      doc.text("ALUNO", M + 3, y);
      doc.text("TURMA", xTurma, y);
      for (const c of colunas) doc.text(c.titulo, c.x, y, { align: "right" });
      y += 7;
    };

    novaPaginaSePreciso(8 + 7 + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ESCURO);
    doc.text(titulo, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text(`${linhas.length} aluno${linhas.length !== 1 ? "s" : ""}`, W - M, y, { align: "right" });
    y += 7;

    if (linhas.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text(vazio, M, y);
      y += 12;
      return;
    }

    tituloTabela();

    for (const l of linhas) {
      if (y + 6 > LIMITE) {
        novaPaginaSePreciso(6);
        tituloTabela();
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXTO);
      doc.text(cortar(l.nome, larguraNome), M + 3, y);
      doc.setTextColor(...CINZA);
      doc.text(cortar(l.turma ?? "—", 20), xTurma, y);
      doc.setTextColor(...TEXTO);
      l.valores.forEach((v, i) => {
        const ultima = i === l.valores.length - 1;
        if (ultima) doc.setFont("helvetica", "bold");
        doc.text(v, colunas[i].x, y, { align: "right" });
      });
      doc.setDrawColor(243, 244, 246);
      doc.line(M, y + 2, W - M, y + 2);
      y += 6;
    }

    novaPaginaSePreciso(9);
    y += 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ESCURO);
    doc.text("Subtotal", M + 3, y);
    doc.text(fmt(total), colunas[colunas.length - 1].x, y, { align: "right" });
    y += 12;
  }

  cabecalho();

  const totalSemanais = semanais.reduce((s, l) => s + l.total, 0);
  const totalMensais  = mensais.reduce((s, l) => s + l.total, 0);
  const R = W - M - 3;

  secao(
    "Semanais",
    [
      { titulo: "SEMANA", x: R - 58 },
      { titulo: "ANTERIORES", x: R - 29 },
      { titulo: "A COBRAR", x: R },
    ],
    semanais.map((l) => ({
      nome: l.nome,
      turma: l.turma,
      valores: [fmt(l.valorSemana), l.valorAnterior > 0 ? fmt(l.valorAnterior) : "—", fmt(l.total)],
    })),
    totalSemanais,
    "Nenhum aluno semanal com consumo nesta semana."
  );

  secao(
    "Mensais",
    [
      { titulo: "COBRANÇA", x: R - 34 },
      { titulo: "EM ABERTO", x: R },
    ],
    mensais.map((l) => ({
      nome: l.nome,
      turma: l.turma,
      valores: [l.dataCombinada, fmt(l.total)],
    })),
    totalMensais,
    "Nenhum aluno mensal para cobrar hoje."
  );

  // ── totais ──
  novaPaginaSePreciso(14 + 6 + 6 + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXTO);
  doc.text("Total semanais", M + 3, y);
  doc.text(fmt(totalSemanais), R, y, { align: "right" });
  y += 6;
  doc.text("Total mensais", M + 3, y);
  doc.text(fmt(totalMensais), R, y, { align: "right" });
  y += 4;

  doc.setFillColor(...LARANJA);
  doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`TOTAL GERAL DO DIA  ·  ${dataBR(hoje)}`, M + 5, y + 9);
  doc.setFontSize(14);
  doc.text(fmt(totalSemanais + totalMensais), W - M - 5, y + 9.2, { align: "right" });

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

  doc.save(`resumao-${hoje}.pdf`);
}
