// Datas no fuso America/Sao_Paulo, como "YYYY-MM-DD". Sem dependências:
// usado tanto no servidor (Vercel roda em UTC) quanto no navegador.

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit",
});

// Dia em Brasília de um instante (ISO ou Date)
export function diaBR(instante: string | Date): string {
  return FORMATO_DIA.format(typeof instante === "string" ? new Date(instante) : instante);
}

export function hojeBR(): string {
  return diaBR(new Date());
}

export function somarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().split("T")[0];
}

// Quantidade de dias de inicio a fim, inclusive
export function diasNoIntervalo(inicio: string, fim: string): number {
  const ms = Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
