// Dados da cantina do usuário logado usados em mensagens de WhatsApp e PDFs.
// Arquivo sem dependências de servidor: pode ser importado por componentes
// client. A busca no banco fica em buscarCantinaInfo() (lib/cantina.ts).

export type CantinaInfo = {
  nome: string;
  escola: string | null;
  pixChave: string | null;
  pixTipo: string | null;
  pixNome: string | null;
};

export const PIX_TIPOS = [
  { value: "celular",   label: "Celular" },
  { value: "cpf",       label: "CPF" },
  { value: "cnpj",      label: "CNPJ" },
  { value: "email",     label: "E-mail" },
  { value: "aleatoria", label: "Chave aleatória" },
];

// "CantinaPro — Nome | Escola", ou só o nome quando a escola está vazia
export function cabecalhoCantina(c: CantinaInfo): string {
  const escola = c.escola?.trim();
  return `CantinaPro — ${c.nome}${escola ? ` | ${escola}` : ""}`;
}

// Linha da chave Pix nas mensagens; null quando a cantina não cadastrou chave
// (a mensagem sai sem a linha, nunca com a chave de outra cantina).
export function linhaPix(c: CantinaInfo): string | null {
  const chave = c.pixChave?.trim();
  if (!chave) return null;
  const tipo = PIX_TIPOS.find((t) => t.value === c.pixTipo)?.label.toLowerCase();
  const nome = c.pixNome?.trim();
  return `Chave Pix${tipo ? ` (${tipo})` : ""}: ${chave}${nome ? ` — em nome de ${nome}` : ""}`;
}

// Bom dia / Boa tarde / Boa noite pelo horário de Brasília
export function saudacaoBR(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })
      .format(new Date())
  );
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}
