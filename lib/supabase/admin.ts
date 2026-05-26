import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const createAdminClient = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    // .replace(/\s/g, '') removes embedded newlines/spaces from Vercel env var paste
    process.env.SUPABASE_SERVICE_ROLE_KEY!.replace(/\s/g, ''),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
