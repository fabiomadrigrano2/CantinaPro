// Este arquivo é gerado automaticamente pelo Supabase CLI.
// Execute: npx supabase gen types typescript --project-id SEU_PROJECT_ID > types/database.types.ts
//
// Ou acesse: Supabase Dashboard > Project > API > TypeScript Types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      // Suas tabelas aparecerão aqui após gerar os tipos
      // Exemplo:
      // users: {
      //   Row: { id: string; email: string; created_at: string }
      //   Insert: { id?: string; email: string; created_at?: string }
      //   Update: { id?: string; email?: string; created_at?: string }
      // }
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
