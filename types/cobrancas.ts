export type CicloSemana = {
  semana_inicio: string; // YYYY-MM-DD (segunda-feira)
  semana_fim: string;    // YYYY-MM-DD (domingo)
  total: number;
  status: "aberto" | "cobrado" | "pago";
  ciclo_id: string | null;
  is_current: boolean;
};
