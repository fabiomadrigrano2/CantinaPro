import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const createAdminClient = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.replace(/\s/g, '');
  console.log("[admin] service_role_key prefix:", key.slice(0, 20), "length:", key.length);
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    key,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
};
